/**
 * Gathers everything a daily brief shows into one `BriefData` blob — the only
 * I/O stage of the print pipeline.
 *
 * `gatherBrief({ day })` calls every tool (weather, calendar, bus, ticktick,
 * bootprint, chores, config), degrading each failure to null/[] so one dead
 * tool never sinks the brief. `day: 'tomorrow'` shifts every date-keyed lookup
 * one day ahead — that's the whole difference between the morning and evening
 * prints. Downstream, `recipientToSections()` in sections.ts turns `BriefData`
 * into a per-person `PrintSection[]`.
 *
 * Weather *formatting* lives in weather-block.ts; bus-trip shaping is at the
 * bottom of this file.
 */
import { getConfig } from '$lib/server/config';
import { getChores } from '$lib/server/chores';
import type { BusTrip, FamilyMember } from '$lib/config';
import { getBus, schoolRunLine, type BusDeparture } from '$lib/server/tools/bus';
import { getWeather } from '$lib/server/tools/weather';
import { getCalendar, type CalendarEvent } from '$lib/server/tools/calendar';
import { getFamilyLists, cleanListName, type ProjectWithTasks } from '$lib/server/tools/ticktick';
import { parseTaskPeople } from '$lib/server/people';
import { getBootprintFact } from '$lib/server/tools/bootprint';
import {
	getSchoolWeek,
	getUpcomingSchoolEvents,
	getSchoolBreak
} from '$lib/server/tools/schoolterms';
import { pickPuzzle, type Puzzle } from '$lib/server/puzzles';
import { getQuote, type Quote } from '$lib/server/tools/quotes';
import { getWeekendVolleyball, weekendDates, type KidFixture } from '$lib/server/tools/volleyball';
import {
	sydneyDateMedium,
	sydneyDateShort,
	sydneyDayOfWeek,
	sydneyTimeCompact,
	sydneyTimeOnDay,
	sydneyYMD
} from '$lib/time';
import { logErr } from '$lib/server/log';
import { weatherBlock } from './weather-block';

// Empty default — the static "Have a good day, kids" closing was dropped (it
// added a dashed-line footer + a line of fixed text that didn't earn its space).
// The field/param/prop stay wired so #19 (agent-generated per-recipient closing)
// can drop straight back in — when `closing` is non-empty, both renderers emit it.
const DEFAULT_CLOSING = '';

export interface BriefInputs {
	now?: Date;
	/** Closing line, e.g. one written by the agent. Defaults to empty — no
	 *  closing rendered. #19 (agent-generated per-recipient closing) will fill. */
	closing?: string;
	/**
	 * `'tomorrow'` shifts the whole brief one day ahead — weather, calendar,
	 * chores, school buses and the masthead all pivot on tomorrow. Drives the
	 * evening print. Default `'today'`.
	 */
	day?: 'today' | 'tomorrow';
}

/**
 * One task off the TickTick "Family" list, surfaced on the brief as a TODOS
 * item — resolved to the people it's assigned to and windowed against the
 * brief's day. (The TickTick list is still literally named "Family"; we render
 * it under the TODOS heading because kids parse "todos" as "anyone can do".)
 */
export interface Todo {
	title: string;
	/** Family-member names this task is assigned to; empty = unassigned. */
	people: string[];
	/** `today` = due on the brief's day; `tomorrow` = due the next day;
	 *  `overdue` = past due and still open. */
	when: 'today' | 'tomorrow' | 'overdue';
	/** Whole calendar-days past due (Sydney-local) — only set when `when === 'overdue'`.
	 *  Drives the print-sheet urgency icon (one bell → two bells past 2 days). */
	daysLate?: number;
}

/**
 * Everything the briefs show, gathered once. `recipientToSections()` turns this
 * into a per-recipient `PrintSection[]`. Tool failures degrade gracefully (null
 * / empty), they don't blow up the brief.
 */
export interface BriefData {
	now: Date;
	/** Which day this brief describes — `'tomorrow'` for the evening print. */
	day?: 'today' | 'tomorrow';
	/** "Monday 11 May" — title case. The brief day (tomorrow's date when `day` is `'tomorrow'`). */
	date: string;
	/** "Thu 21st May, 6:47am" — when the brief was generated, for the receipt footer. */
	printedAt: string;
	/** Pre-formatted compact weather lines, or null if the lookup failed. */
	weatherLines: string[] | null;
	/** lucide-icon key for the condition (see `weatherGlyph`), or null. */
	weatherIcon: string | null;
	events: CalendarEvent[];
	/** The upcoming/current weekend's shared family calendar (Sat+Sun), populated
	 *  only on Fri & Sat morning briefs. Drives the kids' Friday "WEEKEND"
	 *  lookahead and the Friday-evening whole-family sheet; undefined otherwise. */
	weekendEvents?: CalendarEvent[];
	/** Each volleyball kid's weekend game + duty roster — populated alongside
	 *  `weekendEvents` (Fri & Sat briefs), empty/undefined otherwise. */
	volleyball?: KidFixture[];
	family: FamilyMember[];
	/** Kid names (config order) — lets the renderer tell parents from kids. */
	kids: string[];
	/** Per unique kid bus trip: which kids it serves + the school-run line ("501 at 7:42am, …"). */
	schoolBus: { kids: string[]; line: string | null }[];
	/** School term + week the brief day falls in — null on weekends/holidays. */
	schoolWeek: { term: number; week: number } | null;
	/** Upcoming NSW school dates (dev days, holiday blocks) within ~2 weeks, pre-formatted. */
	schoolUpcoming: { label: string; when: string }[];
	/** When school is out: days until it's back + the resume date. null in term. */
	schoolBreak: { resumesLabel: string; days: number } | null;
	chores: { person: string; chores: string[] }[];
	/** TickTick "Family"-list tasks due on the brief's day or overdue, with
	 *  assignees. Rendered on the brief under the TODOS heading. */
	todos: Todo[];
	puzzle: Puzzle;
	/** A TV / comic-strip quote for the morning brief's QUOTE section. */
	funQuote: Quote | null;
	/** "Shopping" list items, shown in full. Empty if the list is empty/missing. */
	shoppingItems: string[];
	/** Shopping items ticked off recently — the evening brief's "recently bought" recap. */
	boughtRecently?: string[];
	/** Daily picture + fact (bootprint.space), or null if the lookup failed. */
	fact: { text: string; image?: string } | null;
	closing: string;
}

export async function gatherBrief({
	now = new Date(),
	closing = DEFAULT_CLOSING,
	day = 'today'
}: BriefInputs = {}): Promise<BriefData> {
	const config = getConfig();
	const tomorrow = day === 'tomorrow';
	// Every date-keyed lookup (calendar, chores, school bus, masthead, todos)
	// pivots on `ref` — `now` for the morning brief, tomorrow for the evening one.
	const ref = tomorrow ? new Date(now.getTime() + 86_400_000) : now;

	const weather = await getWeather().catch((err) => {
		logErr('brief', 'weather lookup failed:', err);
		return null;
	});
	const events = await getCalendar({ range: tomorrow ? 'tomorrow' : 'today' }).catch((err) => {
		logErr('brief', 'calendar lookup failed:', err);
		return [] as CalendarEvent[];
	});
	// Weekend lookahead: on Fri & Sat morning briefs, also pull the shared
	// family calendar for the upcoming Sat+Sun. `rangeFor('weekend')` gives
	// Sat+Sun from Fri/Sat. Feeds the kids' Friday "WEEKEND" section and the
	// Saturday whole-family sheet. Skipped the rest of the week + on the evening
	// (tomorrow) brief, so most briefs make no extra calendar call.
	const refDow = sydneyDayOfWeek(ref);
	// Volleyball fixtures ride the same Fri/Sat window as weekendEvents — the
	// tool itself skips kids without a volleyball config and caches per
	// division. The two fetches are independent, so they run concurrently: on
	// a cold Friday 06:45 cache a slow volleyballnsw page would otherwise add
	// its whole wait on top of the calendar's.
	const weekendWindow = !tomorrow && (refDow === 'Fri' || refDow === 'Sat');
	const [weekendEvents, volleyball] = weekendWindow
		? await Promise.all([
				getCalendar({ range: 'weekend' }).catch((err) => {
					logErr('brief', 'weekend calendar lookup failed:', err);
					return [] as CalendarEvent[];
				}),
				getWeekendVolleyball(weekendDates(ref), ref).catch((err) => {
					logErr('brief', 'volleyball lookup failed:', err);
					return [] as KidFixture[];
				})
			])
		: [undefined, undefined];
	const schoolBus = await collectSchoolBus(ref, tomorrow);
	const schoolWeek = await getSchoolWeek(ref).catch((err) => {
		logErr('brief', 'school week lookup failed:', err);
		return null;
	});
	const schoolUpcoming = await getUpcomingSchoolEvents({ from: ref, withinDays: 14 })
		.then((events) => events.map((e) => ({ label: e.label, when: schoolWhen(e, ref) })))
		.catch((err) => {
			logErr('brief', 'school events lookup failed:', err);
			return [] as { label: string; when: string }[];
		});
	const schoolBreak = await getSchoolBreak(ref)
		.then((b) => {
			if (!b) return null;
			const days = Math.round(
				(Date.parse(`${b.resumes}T00:00:00Z`) - Date.parse(`${sydneyYMD(ref)}T00:00:00Z`)) /
					86_400_000
			);
			return { resumesLabel: fmtDay(b.resumes), days };
		})
		.catch((err) => {
			logErr('brief', 'school break lookup failed:', err);
			return null;
		});
	const familyLists = await getFamilyLists().catch((err) => {
		logErr('brief', 'ticktick lists lookup failed:', err);
		return [] as ProjectWithTasks[];
	});
	// The evening (tomorrow) brief drops the fact section — skip the lookup.
	const bootprint = tomorrow
		? null
		: await getBootprintFact().catch((err) => {
				logErr('brief', 'bootprint lookup failed:', err);
				return null;
			});
	// TickTick glues an emoji onto the list name ("🛒Shopping"), so match on the cleaned name.
	const listIs = (name: string) => (l: ProjectWithTasks) =>
		cleanListName(l.project.name).toLowerCase() === name;
	const shoppingItems = familyLists.find(listIs('shopping'))?.tasks.map((t) => t.title) ?? [];
	// Evening brief only: shopping items ticked off recently (rides along on the
	// list's `done`), for a recap line under the shopping block.
	const boughtRecently = tomorrow
		? (familyLists.find(listIs('shopping'))?.done ?? []).map((t) => t.title)
		: [];
	// The TickTick "Family" list — shared family to-dos, rendered on the brief
	// under the TODOS heading. Each task is windowed against the brief's day and
	// resolved to its assignees (a person tag, else a name in the title); tasks
	// outside the window or without a due date are dropped.
	const todos: Todo[] = (familyLists.find(listIs('family'))?.tasks ?? []).flatMap((t) => {
		const when = taskWhen(t.dueDate, ref);
		if (!when) return [];
		const people = parseTaskPeople(t.title, t.tags, config.family ?? []);
		const daysLate = when === 'overdue' ? daysSince(t.dueDate, ref) : undefined;
		return [{ title: t.title.trim(), people, when, daysLate }];
	});

	const wx = weather ? weatherBlock(weather, day, now) : { lines: null, icon: null };

	return {
		now,
		day,
		date: sydneyDateMedium(ref),
		printedAt: `${sydneyDateShort(now)}, ${sydneyTimeCompact(now)}`,
		weatherLines: wx.lines,
		weatherIcon: wx.icon,
		events,
		weekendEvents,
		volleyball,
		family: config.family ?? [],
		kids: config.kids.map((k) => k.name),
		schoolBus,
		schoolWeek,
		schoolUpcoming,
		schoolBreak,
		chores: getChores({ now: ref }),
		todos,
		puzzle: pickPuzzle(ref),
		funQuote: getQuote({ date: ref }),
		shoppingItems,
		boughtRecently,
		fact: bootprint
			? { text: bootprint.fact, ...(bootprint.image ? { image: bootprint.image } : {}) }
			: null,
		closing
	};
}

/**
 * Where a TickTick task falls relative to the brief's day (`ref`): `today` =
 * due that day, `tomorrow` = due the next day, `overdue` = due before it and
 * still open, null = no due date or due further out (not surfaced). `sydneyYMD`
 * is zero-padded `YYYY-MM-DD`, so a plain string compare orders the dates.
 */
function taskWhen(dueDate: string | undefined, ref: Date): 'today' | 'tomorrow' | 'overdue' | null {
	if (!dueDate) return null;
	const d = new Date(dueDate);
	if (Number.isNaN(d.getTime())) return null;
	const due = sydneyYMD(d);
	const day = sydneyYMD(ref);
	if (due === day) return 'today';
	if (due === sydneyYMD(new Date(ref.getTime() + 86_400_000))) return 'tomorrow';
	if (due < day) return 'overdue';
	return null;
}

/**
 * Calendar-days between a task's due date and the brief's reference day, both
 * in Sydney-local. Returns 0 for not-yet-overdue (we only call this for
 * already-overdue tasks). Driving the urgency icon: 1 day = one bell, >2 days
 * = two bells.
 */
function daysSince(dueDate: string | undefined, ref: Date): number {
	if (!dueDate) return 0;
	const d = new Date(dueDate);
	if (Number.isNaN(d.getTime())) return 0;
	// Parse both YMDs back to UTC midnights for a clean integer-day diff —
	// avoids the DST hour-shift that subtracting raw Dates would smuggle in.
	const dueMs = Date.parse(`${sydneyYMD(d)}T00:00:00Z`);
	const refMs = Date.parse(`${sydneyYMD(ref)}T00:00:00Z`);
	return Math.max(0, Math.round((refMs - dueMs) / 86_400_000));
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A `YYYY-MM-DD` date as a compact "Mon 2 Feb". */
function fmtDay(ymd: string): string {
	const d = new Date(`${ymd}T00:00:00Z`);
	return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/**
 * A school event's date(s) relative to the brief's day (`ref` — tomorrow on the
 * evening print, so "today"/"tomorrow" read correctly to whoever holds the
 * sheet): "today" / "tomorrow" when it's a single day close by, "Mon 2 Feb"
 * otherwise, and a "Tue 27–Fri 30 Jan" span for a multi-day block.
 */
function schoolWhen(e: { start: string; end: string }, ref: Date): string {
	if (e.start !== e.end) return `${fmtDay(e.start)}–${fmtDay(e.end)}`;
	if (e.start === sydneyYMD(ref)) return 'today';
	if (e.start === sydneyYMD(new Date(ref.getTime() + 86_400_000))) return 'tomorrow';
	return fmtDay(e.start);
}

// ────────────────────────────────────────────────────────────────────────────
// Bus: trip data for the live dashboard; school-run lines for the briefs.
// ────────────────────────────────────────────────────────────────────────────

/** Dedupe kid bus trips (stop+routes+targetTime+label) and record which kids each serves. */
function groupedKidTrips(): { trip: BusTrip; kids: string[] }[] {
	const groups = new Map<string, { trip: BusTrip; kids: string[] }>();
	for (const kid of getConfig().kids) {
		for (const trip of kid.buses) {
			const key = `${trip.stop}|${[...trip.routes].sort().join(',')}|${trip.targetTime ?? ''}|${trip.label}`;
			const existing = groups.get(key);
			if (existing) existing.kids.push(kid.name);
			else groups.set(key, { trip, kids: [kid.name] });
		}
	}
	return [...groups.values()];
}

export interface TripReport {
	kids: string[];
	trip: BusTrip;
	departures: BusDeparture[];
}

/**
 * Live departures per unique kid trip — for the dashboard's BusCard, which does
 * its own "is this relevant right now" filtering. For `targetTime` trips, picks
 * around the target; otherwise the next few. (The briefs use `collectSchoolBus`
 * instead — they want the school-run window, not "next from now".)
 */
export async function collectTripReports(now: Date = new Date()): Promise<TripReport[]> {
	const reports: TripReport[] = [];
	for (const { trip, kids } of groupedKidTrips()) {
		const all = await getBus({ stop: trip.stop, routes: trip.routes, limit: 30 }).catch(
			(err): BusDeparture[] => {
				logErr('brief', `bus lookup failed for ${trip.label}:`, err);
				return [];
			}
		);
		const departures = trip.targetTime
			? pickAroundTarget(all, sydneyTimeOnDay(trip.targetTime, now))
			: all.slice(0, 4);
		reports.push({ kids, trip, departures });
	}
	return reports;
}

/**
 * A school-run bus line per unique kid trip, for embedding at the bottom of a
 * kid's SCHOOL section. `scheduled` (the evening print) queries TfNSW's planned
 * timetable for the `now` day rather than the live "next from now" feed.
 */
export async function collectSchoolBus(
	now: Date = new Date(),
	scheduled = false
): Promise<{ kids: string[]; line: string | null }[]> {
	const out: { kids: string[]; line: string | null }[] = [];
	for (const { trip, kids } of groupedKidTrips()) {
		const line = await schoolRunLine(
			{ stop: trip.stop, routes: trip.routes, targetTime: trip.targetTime ?? '08:00' },
			now,
			{ scheduled }
		).catch((err) => {
			logErr('brief', `bus lookup failed for ${trip.label}:`, err);
			return null;
		});
		out.push({ kids, line });
	}
	return out;
}

/**
 * Pick up to 3 departures around the target: one strictly before, the
 * closest, and one strictly after. Falls back gracefully if the window
 * has fewer than 3 candidates. Exported for tests.
 */
export function pickAroundTarget(departures: BusDeparture[], target: Date): BusDeparture[] {
	if (departures.length === 0) return [];
	const sorted = [...departures].sort((a, b) => a.estimatedAt.getTime() - b.estimatedAt.getTime());
	const targetMs = target.getTime();
	let closestIdx = 0;
	let closestDelta = Infinity;
	for (let i = 0; i < sorted.length; i++) {
		const delta = Math.abs(sorted[i].estimatedAt.getTime() - targetMs);
		if (delta < closestDelta) {
			closestDelta = delta;
			closestIdx = i;
		}
	}
	return [sorted[closestIdx - 1], sorted[closestIdx], sorted[closestIdx + 1]].filter(
		(d): d is BusDeparture => Boolean(d)
	);
}
