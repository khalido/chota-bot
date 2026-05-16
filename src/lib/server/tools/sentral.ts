/**
 * Sentral school timetable tool (NSW Dept of Ed student portal).
 *
 * The school re-jigs timetables often, so we re-download the .ics export
 * regularly and only ever read *today's* periods out of it. Past/future events
 * in the file are ignored — by the time you'd care about tomorrow a fresh
 * download will have it (maybe a different version).
 *
 * Auth: the portal login is SAML → Microsoft → NSW DoE ADFS. We `fetch` the
 * .ics export with a session cookie. `refreshTimetable` is **self-healing** —
 * if the stored cookie is missing or expired, it logs in fresh via
 * agent-browser (`loginSentral`, see `sentral-login.ts`) using the kid's
 * `SENTRAL_<NAME>_EMAIL` / `_PASSWORD`, caches the new cookie, and retries.
 *
 * Cookie storage: `data/sentral/<who>-cookie.txt`, written by
 * `refreshSentralCookie` after a login. `SENTRAL_<NAME>_COOKIE` in `.env` is an
 * optional bootstrap/override — the file wins because `.env` is read once at
 * process start (a runtime re-login can write the file but not refresh env).
 *
 * Caching: no in-memory cache — **the .ics file on disk *is* the cache**.
 * `getSchedule()` always reads the file (cheap, offline-safe, never refetches).
 * `refreshTimetable()` does the network fetch and overwrites it. *When* to
 * refresh is a job-level decision — see `jobs/sentral-refresh.ts`.
 *
 * Config (.env):
 *   SENTRAL_BASE_URL            e.g. https://yourschool.sentral.com.au/s-xxxxxx
 *   SENTRAL_<NAME>_STUDENT_ID   from the timetable URL, e.g. .../timetable/3310 → "3310"
 *   SENTRAL_<NAME>_EMAIL        the kid's NSW DoE login (drives the auto-login)
 *   SENTRAL_<NAME>_PASSWORD     "
 *   SENTRAL_<NAME>_COOKIE       optional — bootstrap cookie, skips the first login
 *
 * Three parts:
 *   - `getSchedule(person, ymd?)` — read the cached .ics, parse, return that
 *     day's periods. Pure; feeds the print. [] if there's no file yet.
 *   - `refreshTimetable(person)` — fetch the .ics (self-heals the cookie),
 *     save to `data/sentral/<person>-timetable.ics`. Operational.
 *   - `refreshSentralCookie(person)` — log in via agent-browser, cache the
 *     cookie. Called by `refreshTimetable` on expiry; rarely called directly.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { env } from '$env/dynamic/private';
import { sydneyYMD } from '$lib/time';
import { log } from '$lib/server/log';
import { loginSentral } from './sentral-login';

const TIMETABLE_DIR = 'sentral'; // data/sentral/<who>-{timetable.ics,cookie.txt}

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

function cookiePath(person: string): string {
	return join(process.cwd(), 'data', TIMETABLE_DIR, `${person.toLowerCase()}-cookie.txt`);
}

/**
 * The session cookie for `person`: the runtime cookie file if present (written
 * by `refreshSentralCookie` after an agent-browser login), otherwise the
 * `SENTRAL_<NAME>_COOKIE` .env bootstrap value. Null if neither exists.
 *
 * The file wins because .env is read once at process start — a fresh login
 * writing the file takes effect immediately; rewriting .env wouldn't.
 */
async function getCookie(person: string): Promise<string | null> {
	const fromFile = (await readFile(cookiePath(person), 'utf8').catch(() => '')).trim();
	if (fromFile) return fromFile;
	return env[`SENTRAL_${person.toUpperCase()}_COOKIE`]?.trim() || null;
}

function getCredentials(person: string): { email: string; password: string } | null {
	const u = person.toUpperCase();
	const email = env[`SENTRAL_${u}_EMAIL`];
	const password = env[`SENTRAL_${u}_PASSWORD`];
	if (!email || !password) return null;
	return { email, password };
}

/** Today's (or `ymd`'s) periods for `person`, sorted by start. Empty if no cached .ics. */
export async function getSchedule(
	person: string,
	ymd: string = sydneyYMD()
): Promise<SchedulePeriod[]> {
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

/** Fetch the timetable .ics with a given cookie. Returns the body, or null if the cookie is rejected. */
async function fetchTimetable(
	cfg: { baseUrl: string; studentId: string },
	cookie: string
): Promise<string | null> {
	const url = `${cfg.baseUrl}/portal/timetable/exportStudentTimetable/${cfg.studentId}`;
	const res = await fetch(url, {
		headers: { cookie, accept: 'text/calendar, */*' },
		redirect: 'manual',
		signal: AbortSignal.timeout(15_000)
	});
	// Sentral 30x-redirects an unauthenticated request to the login page rather
	// than 401ing — a non-VCALENDAR body means the cookie is dead.
	const body = res.status === 200 ? await res.text() : '';
	return body.startsWith('BEGIN:VCALENDAR') ? body : null;
}

/**
 * Re-download `person`'s timetable .ics and save it to
 * `data/sentral/<person>-timetable.ics`. Self-healing: tries the stored cookie
 * first; if it's missing or expired, logs in fresh via agent-browser
 * (`refreshSentralCookie`) and retries once.
 */
export async function refreshTimetable(person: string): Promise<{ bytes: number; events: number }> {
	const cfg = sentralConfig(person);
	if (!cfg) {
		throw new Error(
			`No Sentral config for "${person}" — set SENTRAL_BASE_URL and SENTRAL_${person.toUpperCase()}_STUDENT_ID in .env`
		);
	}

	const cookie = await getCookie(person);
	let body = cookie ? await fetchTimetable(cfg, cookie) : null;
	if (!body) {
		log('sentral', `${person}: timetable cookie missing or expired — logging in`);
		const fresh = await refreshSentralCookie(person);
		body = await fetchTimetable(cfg, fresh);
		if (!body) {
			throw new Error(
				`Sentral timetable fetch for "${person}" failed even after a fresh login — investigate.`
			);
		}
	}

	const path = timetablePath(person);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, body, 'utf8');
	const events = parseIcsEvents(body).length;
	log('sentral', `refreshTimetable("${person}"): saved ${body.length} bytes, ${events} events`);
	return { bytes: body.length, events };
}

/**
 * Log in to Sentral for `person` via agent-browser and persist the fresh
 * session cookie to `data/sentral/<person>-cookie.txt`. Returns the cookie.
 */
export async function refreshSentralCookie(person: string): Promise<string> {
	const cfg = sentralConfig(person);
	const creds = getCredentials(person);
	if (!cfg || !creds) {
		const u = person.toUpperCase();
		throw new Error(
			`Can't log in to Sentral for "${person}" — need SENTRAL_BASE_URL, SENTRAL_${u}_STUDENT_ID, SENTRAL_${u}_EMAIL and SENTRAL_${u}_PASSWORD in .env`
		);
	}
	const cookie = await loginSentral({ baseUrl: cfg.baseUrl, ...creds });
	const path = cookiePath(person);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, cookie, 'utf8');
	log('sentral', `refreshSentralCookie("${person}"): cookie refreshed and saved`);
	return cookie;
}

/** The stable per-kid config — base URL + student id. The cookie is volatile and read separately. */
function sentralConfig(person: string): { baseUrl: string; studentId: string } | null {
	const baseUrl = env.SENTRAL_BASE_URL;
	const studentId = env[`SENTRAL_${person.toUpperCase()}_STUDENT_ID`];
	if (!baseUrl || !studentId) return null;
	return { baseUrl, studentId };
}

/**
 * Lowercase names with a complete Sentral config. Keyed off `_STUDENT_ID` —
 * the stable per-kid env var (the cookie is volatile and may live in a file).
 */
export function configuredSentralKids(): string[] {
	return Object.keys(env)
		.map((k) => /^SENTRAL_([A-Z]+)_STUDENT_ID$/.exec(k)?.[1])
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
