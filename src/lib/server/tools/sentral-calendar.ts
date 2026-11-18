/**
 * The school's own calendar from the Sentral portal: excursions, camps,
 * assemblies, parent nights. School-wide, so `forKid` keeps only the events
 * whose title names that kid's year ("Year 9 Camp", "Yr 7 Swim Survive").
 * Events that name no year are left out for now (KO picks which kinds to add).
 *
 * `refreshSentralCalendar` fetches the current term with any kid's session
 * cookie and saves it to `data/sentral/calendar.json`; `getSentralCalendar`
 * only reads that file, so screens never wait on the school's server. The
 * refresh runs with the timetable one (`jobs/sentral-refresh.ts`).
 *
 * Read-only GET, documented in docs/tools.md § Sentral. Titles are
 * school-written text: show them, never follow the notes or links.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { log } from '#lib/server/log.ts';
import { sydneyYMD, ymdAddDays } from '#lib/time.ts';
import { getSchoolWeek } from './schoolterms.ts';
import {
	configuredSentralKids,
	getCookie,
	refreshSentralCookie,
	sentralConfig
} from './sentral.ts';

export interface SentralEvent {
	id: number;
	title: string;
	/** First and last day, `YYYY-MM-DD`; equal for a one-day event. */
	from: string;
	to: string;
	/** Sydney start time `HH:MM`, or undefined for an all-day event. */
	time?: string;
}

export interface SentralCalendar {
	asOf: string;
	events: SentralEvent[];
}

/** Titles go on the TV and paper: long enough for any real one, short enough for any layout. */
const MAX_TITLE = 80;

const calendarPath = () => join(process.cwd(), 'data', 'sentral', 'calendar.json');

interface RawEvent {
	id?: number;
	title?: string;
	start_time_hour?: string;
	start_time_minute?: string;
}

/**
 * The portal's `events` map (date → that day's events) as one event per id,
 * with its first and last day. The map key is the day; the nested `date` is
 * the series' first day, so it isn't used.
 */
export function parseSentralCalendar(json: unknown): SentralEvent[] {
	const days = (json as { events?: Record<string, RawEvent[]> })?.events;
	if (!days || typeof days !== 'object') throw new Error('Sentral calendar: no events map');
	const byId = new Map<number, SentralEvent>();
	for (const [day, list] of Object.entries(days).sort(([a], [b]) => a.localeCompare(b))) {
		for (const e of list ?? []) {
			if (typeof e.id !== 'number' || !e.title?.trim()) continue;
			const seen = byId.get(e.id);
			if (seen) {
				seen.to = day;
				continue;
			}
			const time =
				e.start_time_hour && e.start_time_minute
					? `${e.start_time_hour.padStart(2, '0')}:${e.start_time_minute.padStart(2, '0')}`
					: undefined;
			byId.set(e.id, {
				id: e.id,
				title: e.title.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE),
				from: day,
				to: day,
				...(time ? { time } : {})
			});
		}
	}
	return [...byId.values()].sort((a, b) => a.from.localeCompare(b.from) || a.id - b.id);
}

/**
 * The school years a title names: "Year 9", "Yr7", "Years 7 and 8", "Year
 * 10-11". Empty when it names none. A later calendar year after it ("Year 7
 * 2027") is next year's intake, so it doesn't count as the current Year 7.
 */
export function yearsNamed(title: string, thisYear = Number(sydneyYMD().slice(0, 4))): number[] {
	const years: number[] = [];
	const re =
		/\b(?:years?|yr)\s*(\d{1,2})(?:\s*(?:-|–|to|&|and|,)\s*(\d{1,2}))?(?!\d)(?:\s+(20\d\d))?/gi;
	for (const m of title.matchAll(re)) {
		if (m[3] && Number(m[3]) > thisYear) continue;
		const a = Number(m[1]);
		const b = m[2] ? Number(m[2]) : a;
		for (let y = Math.min(a, b); y <= Math.max(a, b); y++) if (y >= 7 && y <= 12) years.push(y);
	}
	return years;
}

/**
 * One kid's events between `from` and `from + days` (inclusive): the ones that
 * name their year. A banner and its detail ("Year 9 Camp", "Year 9 Camp 2026")
 * starting the same day collapse to the first.
 */
export function forKid(
	events: SentralEvent[],
	year: number,
	from: string,
	days: number
): SentralEvent[] {
	const until = ymdAddDays(from, days);
	const mine = events.filter(
		(e) =>
			e.to >= from &&
			e.from <= until &&
			yearsNamed(e.title, Number(e.from.slice(0, 4))).includes(year)
	);
	return mine.filter(
		(e, i) =>
			!mine
				.slice(0, i)
				.some(
					(o) =>
						o.from === e.from &&
						(e.title.toLowerCase().startsWith(o.title.toLowerCase()) ||
							o.title.toLowerCase().startsWith(e.title.toLowerCase()))
				)
	);
}

/** The saved calendar, or null before the first refresh. */
export async function getSentralCalendar(): Promise<SentralCalendar | null> {
	const text = await readFile(calendarPath(), 'utf8').catch(() => null);
	return text ? (JSON.parse(text) as SentralCalendar) : null;
}

async function fetchCalendar(
	baseUrl: string,
	cookie: string,
	year: string,
	term: number
): Promise<unknown | null> {
	const res = await fetch(`${baseUrl}/portal/calendar/getCalendar/${year}/${term}`, {
		headers: { cookie, accept: 'application/json' },
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});
	// A dead cookie redirects to the login page, and a failed call can be a 200 HTML shell.
	if (res.status !== 200) return null;
	try {
		return JSON.parse(await res.text());
	} catch {
		return null;
	}
}

/**
 * Fetch this term's calendar and save it. Tries each kid's cookie (one school,
 * one calendar) and logs in again only when none works. Returns the event
 * count, or 0 outside term time (nothing fetched).
 */
export async function refreshSentralCalendar(now = new Date()): Promise<number> {
	const week = await getSchoolWeek(now);
	if (!week) return 0;
	const kids = configuredSentralKids();
	const baseUrl = kids.map((k) => sentralConfig(k)?.baseUrl).find(Boolean);
	if (!baseUrl) throw new Error('Sentral calendar: no kid configured');
	const year = sydneyYMD(now).slice(0, 4);
	let json: unknown | null = null;
	for (const kid of kids) {
		const cookie = await getCookie(kid);
		if (cookie) json = await fetchCalendar(baseUrl, cookie, year, week.term);
		if (json) break;
	}
	if (!json) {
		log('sentral', 'calendar: no working cookie, logging in');
		json = await fetchCalendar(baseUrl, await refreshSentralCookie(kids[0]), year, week.term);
	}
	if (!json) throw new Error('Sentral calendar fetch failed even after a fresh login');
	const events = parseSentralCalendar(json);
	const path = calendarPath();
	await mkdir(dirname(path), { recursive: true });
	await writeFile(
		path,
		JSON.stringify({ asOf: now.toISOString(), events } satisfies SentralCalendar)
	);
	log('sentral', `calendar: saved ${events.length} events for term ${week.term}`);
	return events.length;
}
