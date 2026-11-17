/**
 * The screens chota shows on a TV through the Cast receiver (cast/, app
 * FCE23D20): Today, Week and Home, built from the same tools the dashboard
 * reads. `gatherTv` reads; `buildScreens` shapes, with no I/O, so tests feed
 * it fixed data. Times go out as instants; the receiver counts buses down and
 * drops past hours by itself, so a screen stays right between sends.
 *
 * From 18:00 the Today screen looks ahead (KO, 17 Nov): the calendar, chores,
 * school line and weather note are tomorrow's, as on the evening print.
 */
import { createHash } from 'node:crypto';
import type { Screen } from '../../../../cast/src/protocol/schema.ts';
import type { Ventilation } from '@khalido/home';
import { collectTripReports, type TripReport } from '#lib/server/print/brief.ts';
import {
	getWeather,
	tomorrowSummary,
	weatherSummary,
	type Weather
} from '#lib/server/tools/weather.ts';
import { getCalendar, type CalendarEvent } from '#lib/server/tools/calendar.ts';
import { getChores, type ChoreAssignment } from '#lib/server/chores.ts';
import { getQuote, type Quote } from '#lib/server/tools/quotes.ts';
import { getSchedule, type SchedulePeriod } from '#lib/server/tools/sentral.ts';
import { getSchoolWeek } from '#lib/server/tools/schoolterms.ts';
import { sportsNudge } from '#lib/server/print/school-section.ts';
import { getConfig } from '#lib/server/config.ts';
import { houseNow } from '#lib/server/home.ts';
import { parseEventPeople } from '#lib/server/people.ts';
import type { FamilyMember } from '#lib/config.ts';
import { logErr } from '#lib/server/log.ts';
import {
	sydneyHour,
	sydneyNoon,
	sydneyTimeRange,
	sydneyYMD,
	sydneyYMDOffset,
	ymdAddDays
} from '#lib/time.ts';

export type { Screen };

/** From this Sydney hour the Today screen shows tomorrow. */
export const EVENING_HOUR = 18;
/** The school line stays on Today until this hour (then it's back at 18:00, for tomorrow). */
const SCHOOL_UNTIL_HOUR = 15;

export interface TvData {
	/** True from 18:00: Today shows tomorrow. */
	evening: boolean;
	/** The day Today is about, YYYY-MM-DD (Sydney): today, or tomorrow in the evening. */
	day: string;
	trips: TripReport[];
	weather: Weather | null;
	/** The weather note: today's headline, or tomorrow's in the evening. */
	headline: string | null;
	/** The next seven days, from now. */
	events: CalendarEvent[];
	chores: ChoreAssignment[];
	/** Each kid's periods on `day`; empty on a weekend, a holiday, or mid-afternoon. */
	school: { kid: string; periods: SchedulePeriod[] }[];
	schoolWeek: { term: number; week: number } | null;
	/** For who each event is for, read from its title. */
	family: FamilyMember[];
	/** The day's TV-show quote: short ones suit the board's bottom row (the print's pool also has long comic strips). */
	quote: Quote | null;
	home: { summary: string; windows: Ventilation } | null;
}

/** Everything the TV screens show. A source that fails is left empty, never fatal. */
export async function gatherTv(now = new Date()): Promise<TvData> {
	const config = getConfig();
	const hour = sydneyHour(now);
	const evening = hour >= EVENING_HOUR;
	// The same pivot as the evening print (brief.ts): noon tomorrow, Sydney.
	const ref = evening ? sydneyNoon(sydneyYMDOffset(1, now)) : now;
	const day = sydneyYMD(ref);
	const showSchool = evening || hour < SCHOOL_UNTIL_HOUR;
	const [trips, weather, events, school, schoolWeek] = await Promise.all([
		collectTripReports(now),
		getWeather().catch((err) => {
			logErr('tv', 'weather lookup failed:', err);
			return null;
		}),
		getCalendar({ range: 'week' }).catch((err) => {
			logErr('tv', 'calendar lookup failed:', err);
			return [] as CalendarEvent[];
		}),
		showSchool
			? Promise.all(
					config.kids.map(async (k) => ({
						kid: k.name,
						periods: await getSchedule(k.name, day).catch((err) => {
							logErr('tv', `timetable read failed for ${k.name}:`, err);
							return [];
						})
					}))
				)
			: [],
		getSchoolWeek(ref).catch((err) => {
			logErr('tv', 'school week lookup failed:', err);
			return null;
		})
	]);
	const thresholds = config.home?.weather;
	return {
		evening,
		day,
		trips,
		weather,
		headline: !weather
			? null
			: evening
				? tomorrowSummary(weather, thresholds, now)
				: weatherSummary(weather, thresholds, now),
		events,
		chores: getChores({ now: ref }),
		school: school.filter((s) => s.periods.length > 0),
		schoolWeek,
		family: config.family ?? [],
		quote: getQuote({ date: now, kind: 'tv' }),
		home: houseNow(now.getTime())
	};
}

const HOURS = 4;
/** What the hero calendar fits on the TV (the receiver cuts the rest). */
const TIMED_EVENTS = 6;
/** "Upcoming", kept simple (KO): the next two per route. */
const BUSES_PER_ROUTE = 2;
const WEEK_DAYS = 7;

type Block = NonNullable<Screen['blocks']>[number];
type CalendarEventOut = Extract<Block, { type: 'calendar-day' }>['events'][number];

/** The receiver's cap on an id; a recurring Google event's id runs well past it. */
const MAX_ID = 100;

/** The event's id, or a short stable hash of it when it's too long for the receiver. */
export function eventId(id: string): string {
	return id.length <= MAX_ID ? id : createHash('sha1').update(id).digest('hex');
}

function eventOut(e: CalendarEvent, family: FamilyMember[]): CalendarEventOut {
	const who = parseEventPeople(e.summary, family);
	return {
		id: eventId(e.id),
		title: e.summary,
		...(e.isAllDay ? {} : { start: e.start.toISOString(), end: e.end.toISOString() }),
		...(e.location ? { where: e.location } : {}),
		...(who.length ? { who: who.join(', ') } : {})
	};
}

/** One bus row per route on each kid trip, with departures still to come. */
function busBlock(trips: TripReport[], now: Date): Block | null {
	const routes = trips.flatMap(({ trip, kids, departures }) => {
		const ahead = departures.filter((d) => d.estimatedAt.getTime() >= now.getTime());
		const byRoute = Map.groupBy(ahead, (d) => d.route);
		return [...byRoute].map(([route, ds]) => ({
			route,
			to: kids.length ? `${trip.label} · ${kids.join(', ')}` : trip.label,
			departures: ds.slice(0, BUSES_PER_ROUTE).map((d) => ({
				at: d.estimatedAt.toISOString(),
				realtime: d.realtime,
				...(d.cancelled ? { cancelled: true } : {})
			}))
		}));
	});
	return routes.length ? { type: 'bus', title: 'Buses', routes } : null;
}

function weatherBlock(w: Weather | null, headline: string | null, now: Date): Block | null {
	if (!w) return null;
	return {
		type: 'weather',
		now: {
			tempC: Math.round(w.tempC),
			condition: w.condition,
			feelsLikeC: Math.round(w.feelsLikeC),
			...(headline ? { note: headline } : {})
		},
		hours: w.hourly
			.filter((h) => h.at.getTime() > now.getTime())
			.slice(0, HOURS)
			.map((h) => ({ at: h.at.toISOString(), tempC: Math.round(h.tempC), rainPct: h.rainPct }))
	};
}

/** One row per kid: the day's hours ("8:50–3:10") and the sports nudge. */
function schoolBlock(d: TvData): Block | null {
	if (!d.school.length) return null;
	const week = d.schoolWeek ? ` · T${d.schoolWeek.term} Wk${d.schoolWeek.week}` : '';
	return {
		type: 'list',
		title: `School${week}`,
		items: d.school.map(({ kid, periods }) => {
			const hours = sydneyTimeRange(periods[0].start, periods.at(-1)!.end);
			const nudge = sportsNudge(periods);
			return { id: `school:${kid}`, text: nudge ? `${hours} · ${nudge}` : hours, meta: kid };
		})
	};
}

/**
 * The day's events for the hero: all-day ones, then at most `TIMED_EVENTS`
 * timed ones. On a busy day the finished ones go first, so what's left of the
 * day stays on screen.
 */
export function dayEvents(d: Pick<TvData, 'events' | 'day'>, now: Date): CalendarEvent[] {
	const day = d.events.filter((e) => sydneyYMD(e.start) === d.day);
	const timed = day.filter((e) => !e.isAllDay);
	const ended = timed.filter((e) => e.end.getTime() <= now.getTime()).length;
	const drop = Math.min(ended, Math.max(0, timed.length - TIMED_EVENTS));
	return [...day.filter((e) => e.isAllDay), ...timed.slice(drop, drop + TIMED_EVENTS)];
}

/** “The quote.” — Speaker, *Title*; a comic exchange carries its speakers inline. */
export function quoteText(q: Quote): string {
	const by = [q.speaker, q.title ? `*${q.title}*` : ''].filter(Boolean).join(', ');
	return `“${q.quote}”${by ? `\n\n— ${by}` : ''}`;
}

/**
 * The daily briefing (KO, 17 Nov): the day's events and their times first and
 * biggest, the clock beside them; along the bottom weather, buses, chores, and
 * school on school mornings or else the day's quote. In the evening it's tomorrow's.
 */
function today(d: TvData, now: Date): Screen {
	const blocks: (Block | null)[] = [
		{
			type: 'calendar-day',
			title: d.evening ? 'Tomorrow' : 'Today',
			span: 3,
			events: dayEvents(d, now).map((e) => eventOut(e, d.family))
		},
		{ type: 'clock' },
		weatherBlock(d.weather, d.headline, now),
		busBlock(d.trips, now),
		d.chores.length
			? {
					type: 'list',
					title: 'Chores',
					items: d.chores.map((c) => ({
						id: `chore:${c.person}`,
						text: c.chores.join(', '),
						meta: c.person
					}))
				}
			: null,
		// One cell for both: school on school mornings, else the day's quote.
		schoolBlock(d) ?? (d.quote ? { type: 'text', title: 'Quote', text: quoteText(d.quote) } : null)
	];
	return {
		id: 'today',
		title: 'Today',
		columns: 4,
		// The hero row half as tall again as the second (the receiver's tested layout).
		rows: [3, 2],
		blocks: blocks.filter((b) => b !== null)
	};
}

/** The next seven days in columns, empty days included (the receiver's `week` block). */
function week(d: TvData, now: Date): Screen {
	const byDay = Map.groupBy(d.events, (e) => sydneyYMD(e.start));
	const todayKey = sydneyYMD(now);
	const days = Array.from({ length: WEEK_DAYS }, (_, i) => {
		const date = ymdAddDays(todayKey, i);
		return { date, events: (byDay.get(date) ?? []).map((e) => eventOut(e, d.family)) };
	});
	return { id: 'week', title: 'Week', columns: 1, blocks: [{ type: 'week', days }] };
}

const WINDOWS: Record<Ventilation['advice'], string> = {
	open: 'Open',
	close: 'Shut',
	either: 'Either',
	unknown: '—'
};

function house(d: TvData): Screen | null {
	if (!d.home) return null;
	const w = d.home.windows;
	const stat = (label: string, c: number | undefined, humidity: number | undefined): Block[] =>
		c === undefined
			? []
			: [
					{
						type: 'stat',
						label,
						value: Math.round(c * 10) / 10,
						unit: '°C',
						...(humidity !== undefined ? { note: `${Math.round(humidity)}% humidity` } : {})
					}
				];
	return {
		id: 'home',
		title: 'Home',
		columns: 3,
		blocks: [
			...stat('Inside', w.insideC, w.insideHumidity),
			...stat('Outside', w.outsideC, w.outsideHumidity),
			{ type: 'stat', label: 'Windows', value: WINDOWS[w.advice], note: w.why || undefined },
			{ type: 'text', span: 3, text: d.home.summary }
		]
	};
}

/** Today, Week and Home (when the house is connected), then `extra` (a screen put up from chat). */
export function buildScreens(d: TvData, now: Date, extra: Screen[] = []): Screen[] {
	return [today(d, now), week(d, now), house(d), ...extra].filter((s) => s !== null);
}
