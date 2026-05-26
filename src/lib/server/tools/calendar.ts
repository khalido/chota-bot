/**
 * Google Calendar tool. Uses better-auth's stored OAuth tokens (no manual
 * token files). Auto-refreshes via `auth.api.getAccessToken()`.
 *
 * Setup once:
 *   1. /admin → Sign in with Google (grants calendar.readonly scope)
 *   2. Add the Family calendar ID to chota.config.ts → calendar.id
 *      (run `getCalendars()` from a script or admin to see your IDs)
 *
 * After that this tool just works.
 */
import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { auth } from '$lib/server/auth';
import { getConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';
import { log } from '$lib/server/log';
import { eq } from 'drizzle-orm';
import { sydneyDayOfWeek, sydneyTimeOnDay, sydneyYMD } from '$lib/time';

export interface CalendarEvent {
	id: string;
	summary: string;
	description?: string;
	location?: string;
	/** Sydney-local Date for timed events; midnight Sydney for all-day. */
	start: Date;
	end: Date;
	isAllDay: boolean;
	htmlLink?: string;
}

export type CalendarRange = 'today' | 'tomorrow' | 'week' | 'next_week' | 'weekend';

export interface GetCalendarOptions {
	range?: CalendarRange;
	/** Override config.calendar.id (e.g. for testing a different cal). */
	calendarId?: string;
}

// Cache keyed by `(range, sydneyYMD)` so a 'today'/'tomorrow'/'week' entry
// can't outlive the date it was computed for — a failed refresh after midnight
// used to leave yesterday's events cached forever. Custom calendarId bypasses
// the cache (it's per-test/per-debug, not the shared path).
const cache = new Map<string, CalendarEvent[]>();
const cacheKey = (range: CalendarRange, now: Date) => `${range}:${sydneyYMD(now)}`;

/** Read events for a range. Returns cache if hot for *today's* key; otherwise refreshes. */
export async function getCalendar(opts: GetCalendarOptions = {}): Promise<CalendarEvent[]> {
	const range = opts.range ?? 'today';
	if (!opts.calendarId) {
		const key = cacheKey(range, new Date());
		const hit = cache.get(key);
		if (hit) return hit;
	}
	return refreshCalendar(range, opts.calendarId);
}

/** Always fetch + replace cache. Called by the calendar-refresh job + as the
 *  cold-start path of getCalendar. */
export async function refreshCalendar(
	range: CalendarRange = 'today',
	customCalendarId?: string
): Promise<CalendarEvent[]> {
	const { timeMin, timeMax } = rangeFor(range, new Date());
	const events = await fetchEventsList(timeMin, timeMax, customCalendarId);
	if (!customCalendarId) {
		const now = new Date();
		const key = cacheKey(range, now);
		// Drop any older-day entries for this range so the map can't grow unbounded.
		for (const k of cache.keys()) if (k.startsWith(`${range}:`) && k !== key) cache.delete(k);
		cache.set(key, events);
	}
	log('calendar', `${events.length} events for range=${range}`);
	return events;
}

/**
 * Fetch events between two arbitrary Sydney-local moments. Bypasses the
 * range-keyed cache — used by the agent-tool wrapper when the LLM passes a
 * specific date like `2026-06-01`. Per-day calls aren't frequent enough to
 * need their own cache.
 */
export async function getCalendarBetween(
	start: Date,
	end: Date,
	customCalendarId?: string
): Promise<CalendarEvent[]> {
	const events = await fetchEventsList(start, end, customCalendarId);
	log(
		'calendar',
		`${events.length} events between ${start.toISOString()} and ${end.toISOString()}`
	);
	return events;
}

export interface SearchEventsOptions {
	/** Phrase to match (case-insensitive substring on event summary). */
	query: string;
	/** Forward search window in days from `now`. Default 60. */
	days?: number;
	/** Override config.calendar.id (e.g. for testing). */
	calendarId?: string;
	/** Anchor for the window. Defaults to `new Date()`. */
	now?: Date;
}

/**
 * Find events whose summary contains `query` (case-insensitive substring),
 * within a forward window from `now`. Used by the agent tool for "when is
 * the next X" questions.
 *
 * Substring match keeps the implementation simple — the agent expands
 * abbreviations ("vb" → "volleyball") at the prompt layer before calling,
 * so we don't need fuzzy matching here.
 */
export async function searchEvents(opts: SearchEventsOptions): Promise<CalendarEvent[]> {
	const { query, days = 60, calendarId, now = new Date() } = opts;
	const q = query.trim().toLowerCase();
	if (!q) return [];
	const start = now;
	const end = new Date(now.getTime() + days * 86_400_000);
	const events = await fetchEventsList(start, end, calendarId);
	const matches = events.filter((e) => e.summary.toLowerCase().includes(q));
	log('calendar', `search "${query}" over ${days}d → ${matches.length}/${events.length} matches`);
	return matches;
}

/** Shared core: auth + Google API call + transform. No caching, no logging. */
async function fetchEventsList(
	timeMin: Date,
	timeMax: Date,
	customCalendarId?: string
): Promise<CalendarEvent[]> {
	const calendarId = customCalendarId ?? getConfig().calendar?.id;
	if (!calendarId) {
		throw new Error(
			'Set calendar.id in chota.config.ts. List your calendars from /admin or via getCalendarList().'
		);
	}

	const accessToken = await getStoredGoogleToken();
	if (!accessToken) {
		throw new Error('No Google account connected. Visit /admin and click "Sign in with Google".');
	}

	const client = new OAuth2Client();
	client.setCredentials({ access_token: accessToken });

	const cal = google.calendar({ version: 'v3', auth: client });
	const res = await cal.events.list({
		calendarId,
		timeMin: timeMin.toISOString(),
		timeMax: timeMax.toISOString(),
		singleEvents: true,
		orderBy: 'startTime',
		maxResults: 250
	});

	return (res.data.items ?? []).map(toEvent);
}

/** Lists all calendars the connected user has access to. Helper for picking calendar.id. */
export async function getCalendarList(): Promise<
	{ id: string; summary: string; primary: boolean; accessRole: string }[]
> {
	const accessToken = await getStoredGoogleToken();
	if (!accessToken) {
		throw new Error('No Google account connected. Visit /admin and click "Sign in with Google".');
	}
	const client = new OAuth2Client();
	client.setCredentials({ access_token: accessToken });
	const cal = google.calendar({ version: 'v3', auth: client });
	const res = await cal.calendarList.list();
	return (res.data.items ?? []).map((c) => ({
		id: c.id ?? '',
		summary: c.summary ?? '(no name)',
		primary: c.primary ?? false,
		accessRole: c.accessRole ?? '?'
	}));
}

// ────────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────────

/**
 * Phase 1: single-user kiosk. Find the first Google account in the DB and
 * use its access token. better-auth auto-refreshes via getAccessToken().
 *
 * Phase 3 (multi-user): swap to per-request session lookup so each user
 * sees their own calendar.
 */
async function getStoredGoogleToken(): Promise<string | null> {
	const rows = await db.select().from(account).where(eq(account.providerId, 'google')).limit(1);
	const acct = rows[0];
	if (!acct) return null;

	const result = await auth.api.getAccessToken({
		body: { providerId: 'google', userId: acct.userId }
	});
	return result.accessToken ?? null;
}

/**
 * Day boundaries are Sydney-local — `setHours()` would use the server's
 * local TZ, which gives wrong-day events when the kiosk runs in UTC.
 */
function rangeFor(range: CalendarRange, now: Date): { timeMin: Date; timeMax: Date } {
	const startOfSydneyDay = (d: Date) => sydneyTimeOnDay('00:00', d);
	const endOfSydneyDay = (d: Date) => sydneyTimeOnDay('23:59', d);
	const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

	switch (range) {
		case 'today': {
			return { timeMin: startOfSydneyDay(now), timeMax: endOfSydneyDay(now) };
		}
		case 'tomorrow': {
			const tom = addDays(now, 1);
			return { timeMin: startOfSydneyDay(tom), timeMax: endOfSydneyDay(tom) };
		}
		case 'week': {
			// From now → end of Sydney day 7 days out
			return { timeMin: now, timeMax: endOfSydneyDay(addDays(now, 7)) };
		}
		case 'next_week': {
			// Days until next Monday (Sydney): if today's Sydney day is Mon, next Mon = +7
			const dayMap: Record<string, number> = {
				Mon: 1,
				Tue: 2,
				Wed: 3,
				Thu: 4,
				Fri: 5,
				Sat: 6,
				Sun: 7
			};
			const daysToNextMon = 8 - (dayMap[sydneyDayOfWeek(now)] ?? 1);
			const start = addDays(now, daysToNextMon);
			const end = addDays(start, 6);
			return { timeMin: startOfSydneyDay(start), timeMax: endOfSydneyDay(end) };
		}
		case 'weekend': {
			// The closest upcoming Sat 00:00 → Sun 23:59. If today is already
			// the weekend, start from today (so "what's on this weekend" on
			// Sat morning still includes Sat afternoon + Sun).
			const dayMap: Record<string, number> = {
				Mon: 1,
				Tue: 2,
				Wed: 3,
				Thu: 4,
				Fri: 5,
				Sat: 6,
				Sun: 7
			};
			const todayDay = dayMap[sydneyDayOfWeek(now)] ?? 1;
			const daysToSat = todayDay >= 6 ? 0 : 6 - todayDay;
			const daysToSun = 7 - todayDay;
			const start = daysToSat === 0 ? now : addDays(now, daysToSat);
			const end = addDays(now, daysToSun);
			return { timeMin: startOfSydneyDay(start), timeMax: endOfSydneyDay(end) };
		}
	}
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent {
	const startStr = e.start?.dateTime ?? e.start?.date ?? '';
	const endStr = e.end?.dateTime ?? e.end?.date ?? '';
	return {
		id: e.id ?? '',
		summary: e.summary ?? '(no title)',
		description: e.description ?? undefined,
		location: e.location ?? undefined,
		start: new Date(startStr),
		end: new Date(endStr),
		isAllDay: !!e.start?.date && !e.start?.dateTime,
		htmlLink: e.htmlLink ?? undefined
	};
}
