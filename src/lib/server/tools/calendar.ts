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
import { sydneyDayOfWeek, sydneyTimeOnDay } from '$lib/time';

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

export type CalendarRange = 'today' | 'tomorrow' | 'week' | 'next_week';

export interface GetCalendarOptions {
	range?: CalendarRange;
	/** Override config.calendar.id (e.g. for testing a different cal). */
	calendarId?: string;
}

// Cache by range. Custom calendarId bypasses cache.
const cache = new Map<CalendarRange, CalendarEvent[]>();

/** Read events for a range. Returns cache if hot; delegates to refresh on cold. */
export async function getCalendar(opts: GetCalendarOptions = {}): Promise<CalendarEvent[]> {
	const range = opts.range ?? 'today';
	if (!opts.calendarId && cache.has(range)) return cache.get(range)!;
	return refreshCalendar(range, opts.calendarId);
}

/** Always fetch + replace cache. Called by the calendar-refresh job + as the
 *  cold-start path of getCalendar. */
export async function refreshCalendar(
	range: CalendarRange = 'today',
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
		throw new Error(
			'No Google account connected. Visit /admin and click "Sign in with Google".'
		);
	}

	const client = new OAuth2Client();
	client.setCredentials({ access_token: accessToken });

	const cal = google.calendar({ version: 'v3', auth: client });
	const { timeMin, timeMax } = rangeFor(range, new Date());

	const res = await cal.events.list({
		calendarId,
		timeMin: timeMin.toISOString(),
		timeMax: timeMax.toISOString(),
		singleEvents: true,
		orderBy: 'startTime',
		maxResults: 250
	});

	const events = (res.data.items ?? []).map(toEvent);
	if (!customCalendarId) cache.set(range, events);
	log('calendar', `${events.length} events for range=${range}`);
	return events;
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
				Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7
			};
			const daysToNextMon = 8 - (dayMap[sydneyDayOfWeek(now)] ?? 1);
			const start = addDays(now, daysToNextMon);
			const end = addDays(start, 6);
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
