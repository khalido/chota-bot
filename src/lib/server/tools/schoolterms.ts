/**
 * NSW public-school calendar — term dates, school development days and the
 * vacation blocks, for the family's division (Eastern or Western).
 *
 * Primary source: the NSW DoE calendar page,
 *   https://education.nsw.gov.au/schooling/calendars/<year>
 * fetched and parsed with cheerio. It lists the *student* first/last days per
 * division — the dates families actually plan around (the term genuinely
 * starts a day or two earlier for staff, on the development days).
 *
 * Fallback: the DoE iCal feed (`<year>Calendar_v2.ics`, parsed via `ics.ts`).
 * If the page is unreachable, blocked, or its markup shifts — the parse
 * sanity-checks catch that — the tool degrades to the ICS. Its term dates are
 * the *staff* week-1 starts (slightly early) but the tool keeps working.
 *
 * Behind a weekly refresh job (`schoolterms-refresh`) — once-a-week traffic to
 * a public gov page shouldn't draw any anti-bot attention. Every fetch logs
 * its HTTP status, so if that ever changes it shows up in the logs.
 *
 * Pure data — combining this with a kid's timetable (the week in the SCHOOL
 * header, the countdown) happens in the print pipeline, not here.
 */
import * as cheerio from 'cheerio';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';
import { parseIcs, type IcsEvent } from '$lib/server/ics';
import { sydneyYMD } from '$lib/time';

const pageUrl = (year: number) => `https://education.nsw.gov.au/schooling/calendars/${year}`;

/** iCal fallback feeds — hand-versioned filenames, so pinned per year. */
const ICS_URLS: Record<number, string> = {
	2026: 'https://education.nsw.gov.au/content/dam/main-education/schooling/calendars/2026/2026Calendar_v2.ics'
};

const FETCH_TIMEOUT_MS = 15_000;
/** Term dates are static for the year — a long cache TTL is plenty. */
const CACHE_TTL_MS = 12 * 60 * 60_000;
/** Default look-ahead for `getUpcomingSchoolEvents`, in days. */
const DEFAULT_WINDOW_DAYS = 14;

const MONTHS = [
	'january',
	'february',
	'march',
	'april',
	'may',
	'june',
	'july',
	'august',
	'september',
	'october',
	'november',
	'december'
];

export interface SchoolTerm {
	/** Term number, 1–4. */
	term: number;
	/** First day for students, `YYYY-MM-DD`. */
	start: string;
	/** Last day for students, `YYYY-MM-DD`. */
	end: string;
}

export interface UpcomingSchoolEvent {
	/** Human label, e.g. "School development day" or "Autumn holidays". */
	label: string;
	/** Start date, `YYYY-MM-DD`. */
	start: string;
	/** End date, `YYYY-MM-DD`; equals `start` for a single day. */
	end: string;
}

export interface SchoolBreak {
	/** Last day of the current break, `YYYY-MM-DD`. */
	until: string;
	/** First day school is back, `YYYY-MM-DD`. */
	resumes: string;
}

/** A year of school-calendar data, normalised from whichever source answered. */
export interface SchoolYear {
	terms: SchoolTerm[];
	/** Development-day (pupil-free) blocks, by date. */
	devDays: { start: string; end: string }[];
	/** Vacation blocks. */
	holidays: { label: string; start: string; end: string }[];
}

const cache = new Map<number, { data: SchoolYear; at: number }>();

/** Current calendar year in Sydney. */
function currentYear(): number {
	return Number(sydneyYMD().slice(0, 4));
}

/** The family's NSW division — drives which term/dev-day dates apply. */
function schoolDivision(): 'E' | 'W' {
	return getConfig().school?.division ?? 'E';
}

// ────────────────────────────────────────────────────────────────────────────
// Public — derived views over a cached `SchoolYear`
// ────────────────────────────────────────────────────────────────────────────

/** The four school terms for `year` (student first/last days), sorted. */
export async function getSchoolTerms(year: number = currentYear()): Promise<SchoolTerm[]> {
	return (await loadSchoolYear(year)).terms;
}

/**
 * Which school term + week `date` falls in, counted from the term's first
 * student day. null when `date` is outside every term (weekends count as part
 * of their term; holidays and dev days do not).
 */
export async function getSchoolWeek(
	date: Date = new Date()
): Promise<{ term: number; week: number } | null> {
	const ymd = sydneyYMD(date);
	const { terms } = await loadSchoolYear(Number(ymd.slice(0, 4)));
	const term = terms.find((t) => ymd >= t.start && ymd <= t.end);
	if (!term) return null;
	const days = Math.round(
		(Date.parse(`${ymd}T00:00:00Z`) - Date.parse(`${term.start}T00:00:00Z`)) / 86_400_000
	);
	return { term: term.term, week: Math.floor(days / 7) + 1 };
}

/**
 * Key school dates within `withinDays` of `from`: development-day blocks and
 * vacation blocks. Sorted by date.
 */
export async function getUpcomingSchoolEvents(
	opts: { from?: Date; withinDays?: number } = {}
): Promise<UpcomingSchoolEvent[]> {
	const fromDate = opts.from ?? new Date();
	const withinDays = opts.withinDays ?? DEFAULT_WINDOW_DAYS;
	const from = sydneyYMD(fromDate);
	const until = sydneyYMD(new Date(fromDate.getTime() + withinDays * 86_400_000));
	const inWindow = (ymd: string) => ymd >= from && ymd <= until;

	const { devDays, holidays } = await loadSchoolYear(Number(from.slice(0, 4)));
	const events: UpcomingSchoolEvent[] = [
		...devDays
			.filter((d) => inWindow(d.start))
			.map((d) => ({ label: 'School development day', start: d.start, end: d.end })),
		...holidays
			.filter((h) => inWindow(h.start))
			.map((h) => ({ label: h.label, start: h.start, end: h.end }))
	];
	return events.sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * If `date` falls inside a vacation block, that block's last day and the day
 * school is back (the next term's first student day); otherwise null.
 */
export async function getSchoolBreak(date: Date = new Date()): Promise<SchoolBreak | null> {
	const ymd = sydneyYMD(date);
	const { terms, holidays } = await loadSchoolYear(Number(ymd.slice(0, 4)));
	const block = holidays.find((h) => ymd >= h.start && ymd <= h.end);
	if (!block) return null;
	const nextTerm = terms
		.map((t) => t.start)
		.filter((s) => s > block.end)
		.sort()[0];
	return { until: block.end, resumes: nextTerm ?? nextWeekday(addDay(block.end)) };
}

/** Force a re-fetch of `year`, bypassing the cache. The weekly refresh job calls this. */
export async function refreshSchoolCalendar(year: number = currentYear()): Promise<SchoolYear> {
	cache.delete(year);
	return loadSchoolYear(year);
}

// ────────────────────────────────────────────────────────────────────────────
// Source loading — the calendar page, with the iCal feed as a fallback
// ────────────────────────────────────────────────────────────────────────────

/**
 * A year's calendar — the DoE page first, the iCal feed as a fallback. Cached
 * 12h; if both sources fail but a stale copy exists, that's served instead.
 */
async function loadSchoolYear(year: number): Promise<SchoolYear> {
	const hit = cache.get(year);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

	let data: SchoolYear;
	try {
		data = await fetchFromPage(year);
	} catch (pageErr) {
		logErr(
			'schoolterms',
			`calendar page for ${year} unusable — trying the iCal fallback:`,
			pageErr
		);
		try {
			data = await fetchFromIcs(year);
		} catch (icsErr) {
			if (hit) {
				log('schoolterms', `both sources failed for ${year} — serving stale cache`);
				return hit.data;
			}
			logErr('schoolterms', `iCal fallback for ${year} also failed:`, icsErr);
			throw pageErr;
		}
	}
	cache.set(year, { data, at: Date.now() });
	return data;
}

/** Fetch + parse the DoE calendar page for `year`. */
async function fetchFromPage(year: number): Promise<SchoolYear> {
	const res = await fetch(pageUrl(year), {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		headers: { 'user-agent': 'chota-bot (family kiosk; weekly calendar fetch)' }
	});
	// Logged every run: a future anti-bot block shows up here as a non-200.
	log('schoolterms', `calendar page ${year}: HTTP ${res.status}`);
	if (!res.ok) throw new Error(`calendar page HTTP ${res.status}`);

	const data = parsePage(await res.text(), year, schoolDivision());
	log(
		'schoolterms',
		`parsed ${year} page — ${data.terms.length} terms, ${data.devDays.length} dev-day blocks, ${data.holidays.length} holiday blocks`
	);
	return data;
}

/** Fetch + parse the iCal fallback feed for `year`. */
async function fetchFromIcs(year: number): Promise<SchoolYear> {
	const url = ICS_URLS[year];
	if (!url) throw new Error(`no iCal fallback URL pinned for ${year}`);
	const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
	log('schoolterms', `iCal feed ${year}: HTTP ${res.status}`);
	if (!res.ok) throw new Error(`iCal feed HTTP ${res.status}`);

	const events = parseIcs(await res.text());
	const division = schoolDivision();
	return {
		terms: termsFromIcs(events),
		devDays: devDaysFromIcs(events, division),
		holidays: events
			.filter((e) => e.title === 'School Holidays')
			.map((e) => ({ label: 'School holidays', start: e.start, end: e.end }))
	};
}

// ────────────────────────────────────────────────────────────────────────────
// HTML parsing — cheerio, with sanity checks (a wrong shape ⇒ the fallback)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pull a division's calendar out of the DoE page. The page lays each division
 * out as `<h2>{Eastern|Western} division</h2>` followed by three
 * `<h3>…</h3><ul>…</ul>` blocks. Throws if the shape isn't what we expect — a
 * markup change or a block/challenge page — which sends `loadSchoolYear` to
 * the iCal fallback.
 */
function parsePage(html: string, year: number, division: 'E' | 'W'): SchoolYear {
	const $ = cheerio.load(html);
	const heading = `${division === 'W' ? 'Western' : 'Eastern'} division`;

	const h2 = $('h2')
		.filter((_, el) => $(el).text().trim() === heading)
		.first();
	if (!h2.length) {
		throw new Error(`"${heading}" heading not found — page markup changed or blocked`);
	}

	// Walk the `<h3>`/`<ul>` siblings up to the next `<h2>`, keyed by section.
	const lists = new Map<string, { tag: string; text: string }[]>();
	let section: string | null = null;
	h2.nextUntil('h2').each((_, el) => {
		const $el = $(el);
		if ($el.is('h3')) {
			section = $el.text().trim().toLowerCase();
		} else if ($el.is('ul') && section) {
			lists.set(
				section,
				$el
					.find('li')
					.map((__, li) => {
						const $li = $(li);
						const tag = $li.find('strong').first().text().trim();
						const text = $li
							.text()
							.trim()
							.slice(tag.length)
							.replace(/^\s*:\s*/, '');
						return { tag, text };
					})
					.get()
			);
		}
	});

	const terms: SchoolTerm[] = (lists.get('first to last days for students') ?? [])
		.map((row) => {
			const span = parseDates(row.text, year);
			return { term: Number(/term (\d)/i.exec(row.tag)?.[1]), ...span };
		})
		.sort((a, b) => a.term - b.term);

	// ── sanity checks — a wrong shape means a markup change or a block page ──
	if (terms.length !== 4) {
		throw new Error(`expected 4 terms on the ${heading} section, parsed ${terms.length}`);
	}
	for (const t of terms) {
		if (!(t.term >= 1 && t.term <= 4) || !isYmd(t.start) || !isYmd(t.end) || t.end < t.start) {
			throw new Error(`term ${t.term} parsed to a bad date range (${t.start}…${t.end})`);
		}
	}

	const devDays = (lists.get('school development days') ?? []).map((row) =>
		parseDates(row.text, year)
	);
	if (devDays.length === 0) {
		throw new Error('no school development days parsed — page markup changed');
	}

	const holidays = (lists.get('school holidays') ?? []).map((row) => ({
		label: `${/^[A-Za-z]+/.exec(row.tag)?.[0] ?? 'School'} holidays`,
		...parseDates(row.text, year)
	}));

	return { terms, devDays, holidays };
}

/**
 * Parse a date or date span — "Monday 2 February to Thursday 2 April",
 * "Monday 20 April and Tuesday 21 April", or a lone "Monday 20 July". A
 * trailing year is honoured (the summer holiday straddles two), otherwise
 * `defaultYear` applies.
 */
function parseDates(text: string, defaultYear: number): { start: string; end: string } {
	const dates = text
		.split(/\s+(?:to|and)\s+/i)
		.map((part) => parseOneDate(part, defaultYear))
		.filter((d): d is string => d !== null);
	if (dates.length === 0) throw new Error(`could not parse a date from "${text}"`);
	return { start: dates[0], end: dates[dates.length - 1] };
}

/** "Monday 2 February" / "22 December 2025" → `YYYY-MM-DD`, or null. */
function parseOneDate(text: string, defaultYear: number): string | null {
	const m = /(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?/.exec(text);
	if (!m) return null;
	const month = MONTHS.indexOf(m[2].toLowerCase());
	if (month < 0) return null;
	const year = m[3] ? Number(m[3]) : defaultYear;
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
}

function isYmd(s: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ────────────────────────────────────────────────────────────────────────────
// iCal fallback — derive the same shape from the DoE iCal feed
// ────────────────────────────────────────────────────────────────────────────

/** Term ranges from the feed's per-week events (these are the *staff* dates). */
function termsFromIcs(events: IcsEvent[]): SchoolTerm[] {
	const weekly = /^Term (\d+) Week \d+ \(/;
	const byTerm = new Map<number, { start: string; end: string }>();
	for (const e of events) {
		const m = weekly.exec(e.title);
		if (!m) continue;
		const term = Number(m[1]);
		const cur = byTerm.get(term);
		if (!cur) byTerm.set(term, { start: e.start, end: e.end });
		else {
			if (e.start < cur.start) cur.start = e.start;
			if (e.end > cur.end) cur.end = e.end;
		}
	}
	return [...byTerm.entries()].map(([term, v]) => ({ term, ...v })).sort((a, b) => a.term - b.term);
}

/** Dev-day blocks from the feed — single-day VEVENTs, a contiguous run folded. */
function devDaysFromIcs(events: IcsEvent[], division: 'E' | 'W'): { start: string; end: string }[] {
	const named = `School Development Day (${division})`;
	const runs: { start: string; end: string }[] = [];
	for (const e of events
		.filter((e) => e.title === 'School Development Day' || e.title === named)
		.sort((a, b) => (a.start < b.start ? -1 : 1))) {
		const last = runs[runs.length - 1];
		if (last && addDay(last.end) === e.start) last.end = e.end;
		else runs.push({ start: e.start, end: e.end });
	}
	return runs;
}

// ── date helpers ─────────────────────────────────────────────────────────────

/** Next day after a `YYYY-MM-DD` date, as `YYYY-MM-DD`. */
function addDay(ymd: string): string {
	const d = new Date(`${ymd}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

/** `ymd` itself if it's already Mon–Fri, otherwise the next weekday. */
function nextWeekday(ymd: string): string {
	let d = ymd;
	for (let i = 0; i < 7; i++) {
		const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
		if (dow >= 1 && dow <= 5) return d;
		d = addDay(d);
	}
	return d;
}
