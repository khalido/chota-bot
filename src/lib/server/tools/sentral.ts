/**
 * Sentral school timetable tool (NSW Dept of Ed student portal).
 *
 * The school re-jigs timetables often, so we re-download the .ics export
 * regularly and only ever read *today's* periods out of it. Past/future events
 * in the file are ignored — by the time you'd care about tomorrow a fresh
 * download will have it (maybe a different version).
 *
 * Auth shortcut: the portal login is SAML → Microsoft (NSW DoE), but once a
 * browser is logged in it just holds session cookies (`SID`, `PortalSID2`, …).
 * So for now we **store the cookie string per kid** (manually copied from a
 * logged-in browser) and `fetch` the .ics export with it — no SAML dance in
 * code. When the session expires, `refreshTimetable` fails loudly so you know
 * to re-copy the cookie (a paste-it-in admin flow, or auto-login via
 * agent-browser, can come later).
 *
 * How to grab the cookie: in Chrome, log in to Sentral (the SAML/Microsoft
 * email+password flow, no 2FA). Open DevTools → Network tab → click any
 * request to the Sentral host → Headers → Request Headers → copy the whole
 * value of the `Cookie:` header (looks like `SentralAnon=1; SID=…;
 * PortalLoggedIn=1; device=desktop; PortalSID2=…`). Paste it verbatim into
 * `SENTRAL_<NAME>_COOKIE` in `.env`.
 *
 * Caching: there's no in-memory cache here — **the .ics file on disk *is* the
 * cache**. `getSchedule()` always reads the file (cheap, offline-safe, never
 * refetches). `refreshTimetable()` does the network fetch and overwrites the
 * file. *When* to refresh is a job-level decision (cron cadence), not a
 * tool-level one — see `jobs/sentral-refresh.ts`.
 *
 * Config (.env):
 *   SENTRAL_BASE_URL            e.g. https://yourschool.sentral.com.au/s-xxxxxx
 *   SENTRAL_<NAME>_STUDENT_ID   from the timetable URL, e.g. .../timetable/3310 → "3310"
 *   SENTRAL_<NAME>_COOKIE       the full Cookie header from a logged-in browser
 *   SENTRAL_<NAME>_EMAIL/_PASSWORD  (unused for now — kept for the future auto-login path)
 *
 * Two halves:
 *   - `getSchedule(person, ymd?)` — read the cached .ics from disk, parse,
 *     return that day's periods. Pure; this is what feeds the print. Returns
 *     [] if there's no file yet (the section just won't render).
 *   - `refreshTimetable(person)` — fetch the .ics export with the stored
 *     cookie, save to `data/sentral/<person>-timetable.ics`. Operational.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { sydneyYMD } from '$lib/time';
import { log } from '$lib/server/log';

const TIMETABLE_DIR = 'sentral'; // data/sentral/<who>-timetable.ics

export interface SchedulePeriod {
	/** Lesson start/end as real Dates (the .ics stores UTC). */
	start: Date;
	end: Date;
	/** Raw SUMMARY, e.g. "7CRE&: Creativity Yr7". */
	summary: string;
	/** SUMMARY with the leading subject code stripped, e.g. "Creativity Yr7". */
	subject: string;
	/** The subject code before the colon, e.g. "7CRE&" — undefined if there isn't one. */
	code?: string;
	/** Room, e.g. "1D.02" (from LOCATION "Room: 1D.02"). */
	room?: string;
	/** Teacher name (full), parsed from DESCRIPTION, e.g. "Ms Example Teacher". */
	teacher?: string;
	/** Period number, parsed from DESCRIPTION. */
	period?: number;
}

function timetablePath(person: string): string {
	return join(process.cwd(), 'data', TIMETABLE_DIR, `${person.toLowerCase()}-timetable.ics`);
}

/** Today's (or `ymd`'s) periods for `person`, sorted by start. Empty if no cached .ics. */
export async function getSchedule(person: string, ymd: string = sydneyYMD()): Promise<SchedulePeriod[]> {
	const text = await readFile(timetablePath(person), 'utf8').catch(() => null);
	if (!text) return [];
	return parseIcsEvents(text)
		.filter((e) => sydneyYMD(e.start) === ymd)
		.sort((a, b) => a.start.getTime() - b.start.getTime())
		.map((e) => ({
			start: e.start,
			end: e.end,
			summary: e.summary,
			subject: stripSubjectCode(e.summary),
			code: subjectCode(e.summary),
			room: e.location?.replace(/^Room:\s*/i, '').trim() || undefined,
			teacher: matchAfter(e.description, /Teacher:\s*([^\n]+)/i),
			period: numAfter(e.description, /Period:\s*(\d+)/i)
		}));
}

/**
 * Re-download `person`'s timetable .ics from Sentral using the stored session
 * cookie, and save it to `data/sentral/<person>-timetable.ics`. Throws (with a
 * "re-copy the cookie" hint) if the session has expired — Sentral 30x-redirects
 * an unauthenticated request to the Microsoft login page rather than 401ing.
 */
export async function refreshTimetable(person: string): Promise<{ bytes: number; events: number }> {
	const cfg = sentralConfig(person);
	if (!cfg) {
		throw new Error(
			`No Sentral config for "${person}" — set SENTRAL_BASE_URL and SENTRAL_${person.toUpperCase()}_{STUDENT_ID,COOKIE} in .env`
		);
	}
	const url = `${cfg.baseUrl}/portal/timetable/exportStudentTimetable/${cfg.studentId}`;
	const res = await fetch(url, {
		headers: { cookie: cfg.cookie, accept: 'text/calendar, */*' },
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});
	const body = res.status === 200 ? await res.text() : '';
	if (!body.startsWith('BEGIN:VCALENDAR')) {
		throw new Error(
			`Sentral session for "${person}" looks expired (HTTP ${res.status}) — re-copy SENTRAL_${person.toUpperCase()}_COOKIE from a logged-in browser`
		);
	}
	const path = timetablePath(person);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, body, 'utf8');
	const events = parseIcsEvents(body).length;
	log('sentral', `refreshTimetable("${person}"): saved ${body.length} bytes, ${events} events`);
	return { bytes: body.length, events };
}

function sentralConfig(person: string): { baseUrl: string; studentId: string; cookie: string } | null {
	const u = person.toUpperCase();
	const baseUrl = env.SENTRAL_BASE_URL;
	const studentId = env[`SENTRAL_${u}_STUDENT_ID`];
	const cookie = env[`SENTRAL_${u}_COOKIE`];
	if (!baseUrl || !studentId || !cookie) return null;
	return { baseUrl, studentId, cookie };
}

/** Lowercase names that have a complete Sentral config (cookie + student id). */
export function configuredSentralKids(): string[] {
	return Object.keys(env)
		.map((k) => /^SENTRAL_([A-Z]+)_COOKIE$/.exec(k)?.[1])
		.filter((u): u is string => !!u)
		.map((u) => u.toLowerCase())
		.filter((name) => sentralConfig(name) !== null);
}

// ────────────────────────────────────────────────────────────────────────────
// Minimal ICS (RFC 5545) parsing — enough for Sentral's export. No dependency.
// ────────────────────────────────────────────────────────────────────────────

interface IcsEvent {
	start: Date;
	end: Date;
	summary: string;
	location?: string;
	description?: string;
}

export function parseIcsEvents(text: string): IcsEvent[] {
	// Unfold RFC 5545 line continuations: a CRLF followed by a space/tab joins
	// to the previous line (the whitespace is dropped, nothing inserted).
	const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
	const events: IcsEvent[] = [];
	let cur: Partial<IcsEvent> | null = null;
	for (const line of lines) {
		if (line === 'BEGIN:VEVENT') {
			cur = {};
			continue;
		}
		if (line === 'END:VEVENT') {
			if (cur?.start && cur.end && cur.summary !== undefined) events.push(cur as IcsEvent);
			cur = null;
			continue;
		}
		if (!cur) continue;
		const m = /^([A-Za-z-]+)(?:;[^:]*)?:(.*)$/.exec(line);
		if (!m) continue;
		const [, key, value] = m;
		const upperKey = key.toUpperCase();
		// Sentral exports bare-Z UTC; if that ever changes to TZID-tagged times
		// (e.g. `DTSTART;TZID=Australia/Sydney:20260513T085000`), parseIcsDate
		// would silently treat the value as UTC and shift every period 10 hours,
		// which `getSchedule`'s day filter then drops invisibly. Fail loud
		// instead — the next refresh job will throw and surface in /admin/jobs.
		if ((upperKey === 'DTSTART' || upperKey === 'DTEND') && /;TZID=/i.test(line)) {
			throw new Error(
				`Sentral .ics has a TZID-tagged date this parser doesn't support: "${line.slice(0, 80)}". Update parseIcsDate.`
			);
		}
		switch (upperKey) {
			case 'DTSTART': {
				const d = parseIcsDate(value);
				if (d) cur.start = d;
				break;
			}
			case 'DTEND': {
				const d = parseIcsDate(value);
				if (d) cur.end = d;
				break;
			}
			case 'SUMMARY':
				cur.summary = unescapeIcs(value);
				break;
			case 'LOCATION':
				cur.location = unescapeIcs(value);
				break;
			case 'DESCRIPTION':
				cur.description = unescapeIcs(value);
				break;
		}
	}
	return events;
}

/** `YYYYMMDDTHHMMSSZ` (UTC) or `YYYYMMDDTHHMMSS` (treated as UTC — Sentral uses Z) or `YYYYMMDD`. */
function parseIcsDate(s: string): Date | null {
	const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(s);
	if (dt) {
		const [, Y, M, D, h, m, sec] = dt;
		return new Date(Date.UTC(+Y, +M - 1, +D, +h, +m, +sec));
	}
	const d = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
	if (d) return new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
	return null;
}

function unescapeIcs(s: string): string {
	return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

/** Strip a leading subject code like "7CRE&: " or "12ENGADV: " off a SUMMARY. */
function stripSubjectCode(summary: string): string {
	return summary.replace(/^[A-Za-z0-9&]+:\s*/, '').trim() || summary;
}

/** The subject code part ("7CRE&" from "7CRE&: Creativity Yr7"), or undefined. */
function subjectCode(summary: string): string | undefined {
	return /^([A-Za-z0-9&]+):\s/.exec(summary)?.[1];
}

function matchAfter(text: string | undefined, re: RegExp): string | undefined {
	if (!text) return undefined;
	const m = re.exec(text);
	return m ? m[1].trim() : undefined;
}

function numAfter(text: string | undefined, re: RegExp): number | undefined {
	const s = matchAfter(text, re);
	return s ? parseInt(s, 10) : undefined;
}
