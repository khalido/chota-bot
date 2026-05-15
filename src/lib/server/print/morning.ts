import { getConfig } from '$lib/server/config';
import { getChores } from '$lib/server/chores';
import type { BusTrip, FamilyMember } from '$lib/config';
import { getBus, schoolRunLine, type BusDeparture } from '$lib/server/tools/bus';
import {
	getWeather,
	weatherGlyph,
	todayRange,
	tomorrowSummary,
	DEFAULT_THRESHOLDS,
	type ForecastHour,
	type Weather
} from '$lib/server/tools/weather';
import { getCalendar, type CalendarEvent } from '$lib/server/tools/calendar';
import { getFamilyLists, cleanListName, type ProjectWithTasks } from '$lib/server/tools/ticktick';
import { getBootprintFact } from '$lib/server/tools/bootprint';
import { pickPuzzle } from '$lib/server/puzzles';
import { sydneyDateLong, sydneyHour, sydneyTimeOnDay, sydneyYMD } from '$lib/time';
import { logErr } from '$lib/server/log';
import type { WeatherThresholds } from '$lib/config';

const DEFAULT_CLOSING = 'Have a good day, kids -- Chota';

export interface MorningInputs {
	now?: Date;
	/** Closing line, e.g. one written by the agent. Defaults to a static line. */
	closing?: string;
}

/**
 * Everything the briefs show, gathered once. `recipientToSections()` turns this
 * into a per-recipient `PrintSection[]`. Tool failures degrade gracefully (null
 * / empty), they don't blow up the brief.
 */
export interface DueSoonGroup {
	/** TickTick list name, e.g. "Read". */
	list: string;
	items: { title: string; when: 'today' | 'tmrw' }[];
}

export interface MorningData {
	now: Date;
	/** "Monday 11 May" — title case. */
	date: string;
	/** Pre-formatted compact weather lines, or null if the lookup failed. */
	weatherLines: string[] | null;
	/** lucide-icon key for the current condition (see `weatherGlyph`), or null. */
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
	/** Daily picture + fact (bootprint.space), or null if the lookup failed. */
	fact: { text: string; image?: string } | null;
	closing: string;
}


export async function gatherMorning({
	now = new Date(),
	closing = DEFAULT_CLOSING
}: MorningInputs = {}): Promise<MorningData> {
	const config = getConfig();

	const weather = await getWeather().catch((err) => {
		logErr('morning', 'weather lookup failed:', err);
		return null;
	});
	const events = await getCalendar({ range: 'today' }).catch((err) => {
		logErr('morning', 'calendar lookup failed:', err);
		return [] as CalendarEvent[];
	});
	const schoolBus = await collectSchoolBus(now);
	const familyLists = await getFamilyLists().catch((err) => {
		logErr('morning', 'ticktick lists lookup failed:', err);
		return [] as ProjectWithTasks[];
	});
	const bootprint = await getBootprintFact().catch((err) => {
		logErr('morning', 'bootprint lookup failed:', err);
		return null;
	});

	// TickTick glues an emoji onto the list name ("🛒Shopping"), so match on the cleaned name.
	const isShopping = (l: ProjectWithTasks) => cleanListName(l.project.name).toLowerCase() === 'shopping';
	const shoppingItems = familyLists.find(isShopping)?.tasks.map((t) => t.title) ?? [];
	const dueSoon: DueSoonGroup[] = familyLists
		.filter((l) => !isShopping(l))
		.map((l) => ({
			list: cleanListName(l.project.name),
			items: l.tasks
				.map((t) => ({ title: t.title, when: dueLabel(t.dueDate, now) }))
				.filter((x): x is DueSoonGroup['items'][number] => x.when !== null)
		}))
		.filter((g) => g.items.length > 0);

	return {
		now,
		date: sydneyDateLong(now),
		weatherLines: weather ? formatGusWeather(weather, now) : null,
		weatherIcon: weather ? weatherGlyph(weather.condition) : null,
		events,
		family: config.family ?? [],
		schoolBus,
		chores: getChores({ now }),
		dueSoon,
		puzzle: pickPuzzle(now),
		shoppingItems,
		fact: bootprint ? { text: bootprint.fact, ...(bootprint.image ? { image: bootprint.image } : {}) } : null,
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
// Weather: GUS-style block.
// ────────────────────────────────────────────────────────────────────────────

/**
 * GUS-inspired weather block. Rain block only appears when the day actually
 * has actionable rain in the 7am-7pm window (otherwise we don't waste a line).
 *
 *   [ MOSTLY SUNNY ]
 *   21 C now
 *
 *   rain 2-4pm
 *   ..::==##::..
 *
 *   -> Mostly sunny, 17-20C today.
 */
export function formatGusWeather(weather: Weather, now: Date = new Date()): string[] {
	const lines: string[] = [];
	const feelsGap = Math.abs(weather.feelsLikeC - weather.tempC) >= 3;
	const nowBit = `${Math.round(weather.tempC)}C now${feelsGap ? ` (feels ${Math.round(weather.feelsLikeC)}C)` : ''}`;
	lines.push(`[ ${weather.condition.toUpperCase()} ]  ${nowBit}`);

	// Rain — always show something. A notable run gets the window + sparkline;
	// otherwise just the peak chance, highlighting roughly when it's likeliest.
	const thresholds = getConfig().home?.weather;
	const rain = rainSummaryToday(weather.hourly, now, thresholds);
	if (rain) {
		lines.push(`${rain.text}  ${rain.sparkline}`);
	} else {
		const peak = rainPeakTodayWindow(weather.hourly, now);
		if (peak) {
			lines.push(
				peak.pct >= 25
					? `rain ${peak.pct}% chance, peaks ~${formatHourShort(peak.atHour)}`
					: `rain ${peak.pct}% chance today`
			);
		}
	}

	// Summary line — additive only (no condition repeat): today's range, wind, UV.
	const range = todayRange(weather.hourly, now);
	const bits: string[] = [];
	if (range) bits.push(`${Math.round(range.minC)}-${Math.round(range.maxC)}C today`);
	bits.push(`wind ${Math.round(weather.windKmh)}km/h`);
	if (weather.uvIndex >= 3) bits.push(`UV ${Math.round(weather.uvIndex)}`);
	lines.push(`-> ${bits.join(', ')}`);

	// One short line for tomorrow (condition + range, or rain onset).
	const tm = tomorrowSummary(weather, thresholds, now);
	if (tm) {
		lines.push(`-> tmrw: ${tm.replace(/^Tomorrow:\s*/, '').replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}`);
	}
	return lines;
}

/** Peak rain probability in today's 7am-7pm Sydney window + the hour it peaks; null if no data. */
export function rainPeakTodayWindow(
	hourly: ForecastHour[],
	now: Date = new Date()
): { pct: number; atHour: number } | null {
	const todayKey = sydneyYMD(now);
	const windowHours = hourly
		.filter((h) => sydneyYMD(h.at) === todayKey)
		.filter((h) => {
			const hr = sydneyHour(h.at);
			return hr >= RAIN_WINDOW_START_HR && hr < RAIN_WINDOW_END_HR;
		});
	if (windowHours.length === 0) return null;
	let best = windowHours[0];
	for (const h of windowHours) if (h.rainPct > best.rainPct) best = h;
	return { pct: Math.round(best.rainPct), atHour: sydneyHour(best.at) };
}

// ────────────────────────────────────────────────────────────────────────────
// Rain summary for the morning print: an actionable text line + sparkline.
// Exported for tests.
// ────────────────────────────────────────────────────────────────────────────

/** "Out and about" hours: 7am inclusive → 7pm exclusive (Sydney local). */
export const RAIN_WINDOW_START_HR = 7;
export const RAIN_WINDOW_END_HR = 19;

export interface RainSummary {
	/** Actionable label, e.g. "rain 2-4pm" or "rain most of the day". */
	text: string;
	/** Density sparkline across the available window hours. */
	sparkline: string;
}

/**
 * Returns null when no hour in the 7am-7pm window today reaches the
 * threshold — caller should skip the block entirely on dry days.
 */
export function rainSummaryToday(
	hourly: ForecastHour[],
	now: Date = new Date(),
	thresholds: Partial<WeatherThresholds> = {}
): RainSummary | null {
	const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
	const todayKey = sydneyYMD(now);
	const windowHours = hourly
		.filter((h) => sydneyYMD(h.at) === todayKey)
		.filter((h) => {
			const hr = sydneyHour(h.at);
			return hr >= RAIN_WINDOW_START_HR && hr < RAIN_WINDOW_END_HR;
		})
		.sort((a, b) => a.at.getTime() - b.at.getTime());

	if (windowHours.length === 0) return null;
	if (!windowHours.some((h) => h.rainPct >= t.rainPctSoon)) return null;

	const sparkline = windowHours.map((h) => sparkChar(h.rainPct)).join('');

	const wetHours = windowHours.filter((h) => h.rainPct >= t.rainPctSoon);
	const runs = findRuns(wetHours.map((h) => sydneyHour(h.at)));
	const totalWet = runs.reduce((s, r) => s + (r.end - r.start + 1), 0);

	let text: string;
	if (totalWet === windowHours.length) text = 'rain all day';
	else if (totalWet >= Math.ceil(windowHours.length * 0.75)) text = 'rain most of the day';
	else if (runs.length >= 3) text = 'showers throughout';
	else text = `rain ${runs.map((r) => formatHourRange(r.start, r.end)).join(' and ')}`;

	return { text, sparkline };
}

function sparkChar(pct: number): string {
	if (pct <= 0) return ' ';
	if (pct < 20) return '.';
	if (pct < 40) return ':';
	if (pct < 60) return '=';
	if (pct < 80) return '#';
	return '%';
}

function findRuns(hours: number[]): { start: number; end: number }[] {
	if (hours.length === 0) return [];
	const sorted = [...hours].sort((a, b) => a - b);
	const runs: { start: number; end: number }[] = [];
	let start = sorted[0];
	let end = start;
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] === end + 1) end = sorted[i];
		else {
			runs.push({ start, end });
			start = sorted[i];
			end = start;
		}
	}
	runs.push({ start, end });
	return runs;
}

function formatHourRange(start: number, end: number): string {
	if (start === end) return formatHourShort(start);
	const startSuffix = start < 12 ? 'am' : 'pm';
	const endSuffix = end < 12 ? 'am' : 'pm';
	if (startSuffix === endSuffix) {
		return `${displayHour(start)}-${displayHour(end)}${endSuffix}`;
	}
	return `${formatHourShort(start)}-${formatHourShort(end)}`;
}

function formatHourShort(hr: number): string {
	const suffix = hr < 12 ? 'am' : 'pm';
	return `${displayHour(hr)}${suffix}`;
}

function displayHour(hr: number): number {
	if (hr === 0) return 12;
	if (hr <= 12) return hr;
	return hr - 12;
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
				logErr('morning', `bus lookup failed for ${trip.label}:`, err);
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

/** A school-run bus line per unique kid trip, for embedding at the bottom of a kid's SCHOOL section. */
export async function collectSchoolBus(now: Date = new Date()): Promise<{ kids: string[]; line: string | null }[]> {
	const out: { kids: string[]; line: string | null }[] = [];
	for (const { trip, kids } of groupedKidTrips()) {
		const line = await schoolRunLine(
			{ stop: trip.stop, routes: trip.routes, targetTime: trip.targetTime ?? '08:00' },
			now
		).catch((err) => {
			logErr('morning', `bus lookup failed for ${trip.label}:`, err);
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
	const sorted = [...departures].sort(
		(a, b) => a.estimatedAt.getTime() - b.estimatedAt.getTime()
	);
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
