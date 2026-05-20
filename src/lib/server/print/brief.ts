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
import { getBootprintFact } from '$lib/server/tools/bootprint';
import { pickPuzzle } from '$lib/server/puzzles';
import { sydneyDateLong, sydneyTimeOnDay, sydneyYMD } from '$lib/time';
import { logErr } from '$lib/server/log';
import { weatherBlock } from './weather-block';

const DEFAULT_CLOSING = 'Have a good day, kids -- Chota';

export interface BriefInputs {
	now?: Date;
	/** Closing line, e.g. one written by the agent. Defaults to a static line. */
	closing?: string;
	/**
	 * `'tomorrow'` shifts the whole brief one day ahead — weather, calendar,
	 * chores, school buses and the masthead all pivot on tomorrow. Drives the
	 * evening print. Default `'today'`.
	 */
	day?: 'today' | 'tomorrow';
}

export interface DueSoonGroup {
	/** TickTick list name, e.g. "Read". */
	list: string;
	items: { title: string; when: 'today' | 'tmrw' }[];
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
	/** Pre-formatted compact weather lines, or null if the lookup failed. */
	weatherLines: string[] | null;
	/** lucide-icon key for the condition (see `weatherGlyph`), or null. */
	weatherIcon: string | null;
	events: CalendarEvent[];
	family: FamilyMember[];
	/** Per unique kid bus trip: which kids it serves + the school-run line ("501 at 7:42am, …"). */
	schoolBus: { kids: string[]; line: string | null }[];
	chores: { person: string; chores: string[] }[];
	/** Tasks across the family lists (excl. Shopping) due today or tomorrow. */
	dueSoon: DueSoonGroup[];
	puzzle: { q: string; a: string };
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
	// Every date-keyed lookup (calendar, chores, school bus, masthead, due-soon)
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
	const schoolBus = await collectSchoolBus(ref, tomorrow);
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
	const isShopping = (l: ProjectWithTasks) =>
		cleanListName(l.project.name).toLowerCase() === 'shopping';
	const shoppingItems = familyLists.find(isShopping)?.tasks.map((t) => t.title) ?? [];
	// Evening brief only: shopping items ticked off recently (rides along on the
	// list's `done`), for a recap line under the shopping block.
	const boughtRecently = tomorrow
		? (familyLists.find(isShopping)?.done ?? []).map((t) => t.title)
		: [];
	const dueSoon: DueSoonGroup[] = familyLists
		.filter((l) => !isShopping(l))
		.map((l) => ({
			list: cleanListName(l.project.name),
			items: l.tasks
				// Anchored on the real `now`, not `ref` — the reader sees the sheet
				// today, so a task due tomorrow must read "tmrw" on both briefs.
				.map((t) => ({ title: t.title, when: dueLabel(t.dueDate, now) }))
				.filter((x): x is DueSoonGroup['items'][number] => x.when !== null)
		}))
		.filter((g) => g.items.length > 0);

	const wx = weather ? weatherBlock(weather, day, now) : { lines: null, icon: null };

	return {
		now,
		day,
		date: sydneyDateLong(ref),
		weatherLines: wx.lines,
		weatherIcon: wx.icon,
		events,
		family: config.family ?? [],
		schoolBus,
		chores: getChores({ now: ref }),
		dueSoon,
		puzzle: pickPuzzle(ref),
		shoppingItems,
		boughtRecently,
		fact: bootprint
			? { text: bootprint.fact, ...(bootprint.image ? { image: bootprint.image } : {}) }
			: null,
		closing
	};
}

/** "today" / "tmrw" if the TickTick dueDate is today/tomorrow in Sydney; else null. */
function dueLabel(dueDate: string | undefined, now: Date): 'today' | 'tmrw' | null {
	if (!dueDate) return null;
	const d = new Date(dueDate);
	if (Number.isNaN(d.getTime())) return null;
	const ymd = sydneyYMD(d);
	if (ymd === sydneyYMD(now)) return 'today';
	if (ymd === sydneyYMD(new Date(now.getTime() + 86_400_000))) return 'tmrw';
	return null;
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
