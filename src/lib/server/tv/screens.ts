/**
 * The screens chota shows on a TV through the Cast receiver (cast/, app
 * FCE23D20): Today, Week and Home, built from the same tools the dashboard
 * reads. `gatherTv` reads; `buildScreens` shapes, with no I/O, so tests feed
 * it fixed data. Times go out as instants; the receiver counts buses down and
 * drops past hours by itself, so a screen stays right between sends.
 *
 * From 18:00 the Today screen looks ahead (KO, 17 Nov): the calendar, chores,
 * school line and weather note are tomorrow's, as on the evening print.
 *
 * Mornings lead with a column per kid (KO picked it, 18 Nov): their school
 * hours and nudge, school dates coming up, their events and chores, under a
 * strip of clock, the bus, weather with what to wear, and the quote.
 */
import { createHash } from 'node:crypto';
import type { Screen } from '../../../../cast/src/protocol/schema.ts';
import type { Ventilation } from '@khalido/home';
import { collectTripReports, type TripReport } from '#lib/server/print/brief.ts';
import {
	getWeather,
	tomorrowSummary,
	weatherSummary,
	weatherWear,
	type Weather
} from '#lib/server/tools/weather.ts';
import { getCalendar, type CalendarEvent } from '#lib/server/tools/calendar.ts';
import { getChores, type ChoreAssignment } from '#lib/server/chores.ts';
import { getQuote, type Quote } from '#lib/server/tools/quotes.ts';
import { getSchedule, kidYear, type SchedulePeriod } from '#lib/server/tools/sentral.ts';
import { getSchoolWeek } from '#lib/server/tools/schoolterms.ts';
import {
	forKid,
	getSentralCalendar,
	type SentralEvent
} from '#lib/server/tools/sentral-calendar.ts';
import { sportsNudge } from '#lib/server/print/school-section.ts';
import { getConfig } from '#lib/server/config.ts';
import { houseNow } from '#lib/server/home.ts';
import { parseEventPeople } from '#lib/server/people.ts';
import type { FamilyMember } from '#lib/config.ts';
import { logErr } from '#lib/server/log.ts';
import {
	sydneyDateMedium,
	sydneyHour,
	sydneyNoon,
	sydneyTimeCompact,
	sydneyTimeRange,
	sydneyYMD,
	sydneyYMDOffset,
	ymdAddDays,
	ymdDiffDays
} from '#lib/time.ts';

export type { Screen };

/** From this Sydney hour the Today screen shows tomorrow. */
export const EVENING_HOUR = 18;
/** The school line stays on Today until this hour (then it's back at 18:00, for tomorrow). */
const SCHOOL_UNTIL_HOUR = 15;
/** How far ahead school events show: three weeks, so a camp or swim week is on the board well before. */
export const SCHOOL_EVENT_DAYS = 21;

export interface TvData {
	/** True from 18:00: Today shows tomorrow. */
	evening: boolean;
	/** The day Today is about, YYYY-MM-DD (Sydney): today, or tomorrow in the evening. */
	day: string;
	trips: TripReport[];
	weather: Weather | null;
	/** The weather note: today's headline, or tomorrow's in the evening. */
	headline: string | null;
	/** What to wear or take today ("Umbrella and a jumper"); null in the evening or when nothing's needed. */
	wear: string | null;
	/** The kids, in config order: one morning column each. */
	kids: string[];
	/** The next seven days, from now. */
	events: CalendarEvent[];
	chores: ChoreAssignment[];
	/** Each kid's periods on `day`; empty on a weekend, a holiday, or mid-afternoon. */
	school: { kid: string; periods: SchedulePeriod[] }[];
	/** Each kid's school-calendar events from `day` to `SCHOOL_EVENT_DAYS` ahead (the ones naming their year). */
	schoolEvents: { kid: string; events: SentralEvent[] }[];
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
	const [trips, weather, events, school, schoolWeek, schoolEvents] = await Promise.all([
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
		}),
		schoolEventsFor(
			config.kids.map((k) => k.name),
			day
		).catch((err) => {
			logErr('tv', 'school calendar read failed:', err);
			return [];
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
		wear: weather && !evening ? weatherWear(weather, thresholds, now) : null,
		kids: config.kids.map((k) => k.name),
		events,
		chores: getChores({ now: ref }),
		school: school.filter((s) => s.periods.length > 0),
		schoolEvents,
		schoolWeek,
		family: config.family ?? [],
		quote: getQuote({ date: now, kind: 'tv' }),
		home: houseNow(now.getTime())
	};
}

/** Each kid's events from the saved school calendar; a kid whose year isn't known gets none. */
async function schoolEventsFor(
	kids: string[],
	day: string
): Promise<{ kid: string; events: SentralEvent[] }[]> {
	const cal = await getSentralCalendar();
	if (!cal) return [];
	const out = await Promise.all(
		kids.map(async (kid) => {
			const year = await kidYear(kid);
			return { kid, events: year ? forKid(cal.events, year, day, SCHOOL_EVENT_DAYS) : [] };
		})
	);
	return out.filter((k) => k.events.length > 0);
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

function weatherBlock(
	w: Weather | null,
	headline: string | null,
	now: Date,
	more: { wear?: string | null; trace?: boolean } = {}
): Block | null {
	if (!w) return null;
	const today = w.hourly.filter((h) => sydneyYMD(h.at) === sydneyYMD(now));
	return {
		type: 'weather',
		now: {
			tempC: Math.round(w.tempC),
			condition: w.condition,
			feelsLikeC: Math.round(w.feelsLikeC),
			...(headline ? { note: headline } : {}),
			...(more.wear ? { wear: more.wear } : {})
		},
		...(more.trace && today.length > 1
			? { trace: today.map((h) => ({ at: h.at.toISOString(), tempC: Math.round(h.tempC) })) }
			: {}),
		hours: w.hourly
			.filter((h) => h.at.getTime() > now.getTime())
			.slice(0, HOURS)
			.map((h) => ({ at: h.at.toISOString(), tempC: Math.round(h.tempC), rainPct: h.rainPct }))
	};
}

/** "Today" (or "Tomorrow" on the evening board), "Now, to Fri, 11 Dec", or the first day and how many days it runs. */
function whenText(e: SentralEvent, d: Pick<TvData, 'day' | 'evening'>): string {
	const short = (ymd: string) => sydneyDateMedium(sydneyNoon(ymd));
	if (e.from <= d.day)
		return e.to > d.day ? `Now, to ${short(e.to)}` : d.evening ? 'Tomorrow' : 'Today';
	const days = ymdDiffDays(e.from, e.to) + 1;
	return `${short(e.from)}${days > 1 ? ` (${days} days)` : ''}`;
}

/**
 * Per kid: the day's hours and sports nudge, then what's coming up at school
 * ("Wed, 9 Dec (3 days) · Year 9 Camp"). Shown when either is there.
 */
function schoolBlock(d: TvData): Block | null {
	const kids = [...new Set([...d.school.map((s) => s.kid), ...d.schoolEvents.map((s) => s.kid)])];
	if (!kids.length) return null;
	const week = d.schoolWeek ? ` · T${d.schoolWeek.term} Wk${d.schoolWeek.week}` : '';
	const items = kids.flatMap((kid) => {
		const periods = d.school.find((s) => s.kid === kid)?.periods ?? [];
		const events = d.schoolEvents.find((s) => s.kid === kid)?.events ?? [];
		const rows: { id: string; text: string; meta: string }[] = [];
		if (periods.length) {
			const hours = sydneyTimeRange(periods[0].start, periods.at(-1)!.end);
			const nudge = sportsNudge(periods);
			rows.push({ id: `school:${kid}`, text: nudge ? `${hours} · ${nudge}` : hours, meta: kid });
		}
		for (const e of events)
			rows.push({
				id: `school-event:${e.id}:${kid}`,
				text: `${whenText(e, d)} · ${e.title}`,
				meta: kid
			});
		return rows;
	});
	return { type: 'list', title: `School${week}`, items };
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

/** How long before the bus the countdown bar starts filling. */
const LEAVE_BAR_MINS = 30;

/**
 * The next kid bus still to come, as a countdown: "School bus" in N min, "501
 * at 8:04". No walk time is configured, so it counts to the bus itself.
 */
function leaveBlock(trips: TripReport[], now: Date): Block | null {
	const next = trips
		.flatMap(({ trip, departures }) =>
			departures
				.filter((d) => !d.cancelled && d.estimatedAt.getTime() > now.getTime())
				.map((d) => ({ trip, d }))
		)
		.sort((a, b) => a.d.estimatedAt.getTime() - b.d.estimatedAt.getTime())[0];
	if (!next) return null;
	const label = `${next.trip.label[0].toUpperCase()}${next.trip.label.slice(1)} bus`;
	return {
		type: 'leave',
		at: next.d.estimatedAt.toISOString(),
		label,
		note: `${next.d.route} at ${sydneyTimeCompact(next.d.estimatedAt)}`,
		from: new Date(next.d.estimatedAt.getTime() - LEAVE_BAR_MINS * 60_000).toISOString()
	};
}

/** One kid's column: school hours and nudge, school dates coming up, their events today, their chores. */
function personBlock(d: TvData, kid: string, now: Date, span: number): Block {
	const periods = d.school.find((s) => s.kid === kid)?.periods ?? [];
	const dates = (d.schoolEvents.find((s) => s.kid === kid)?.events ?? []).map((e) => ({
		// An event already running shows from today; the receiver hides past dates.
		date: e.from < d.day ? d.day : e.from,
		title: e.title
	}));
	const events = dayEvents(d, now)
		.filter((e) => parseEventPeople(e.summary, d.family).includes(kid))
		.map((e) => eventOut(e, d.family));
	const chores = d.chores.find((c) => c.person === kid)?.chores ?? [];
	const nudge = periods.length ? sportsNudge(periods) : null;
	return {
		type: 'person',
		span,
		name: kid,
		...(periods.length
			? {
					hours: {
						start: periods[0].start.toISOString(),
						end: periods.at(-1)!.end.toISOString(),
						label: 'School'
					}
				}
			: {}),
		...(nudge ? { nudge } : {}),
		...(dates.length ? { dates } : {}),
		...(events.length ? { events } : {}),
		...(chores.length ? { chores: chores.map((text) => ({ text })) } : {})
	};
}

/**
 * The morning board: a strip of clock, the bus countdown, weather with what to
 * wear and today's trace, and the quote; then one column per kid. Daytime only
 * (in the evening Today already looks at tomorrow).
 */
function morning(d: TvData, now: Date): Screen | null {
	if (d.evening || !d.kids.length) return null;
	// The receiver's grid is at most 4 wide: two kids take two columns each,
	// three take a column each of three, and the strip fills the same width.
	const columns = d.kids.length === 3 ? 3 : 4;
	const span = d.kids.length <= 2 ? 4 / d.kids.length : 1;
	const strip = [
		{ type: 'clock' } as Block,
		leaveBlock(d.trips, now),
		weatherBlock(d.weather, d.headline, now, { wear: d.wear, trace: true }),
		d.quote ? ({ type: 'text', title: 'Quote', text: quoteText(d.quote) } as Block) : null
	]
		.filter((b) => b !== null)
		.slice(0, columns);
	// A short strip (no bus, no quote) stretches its last block to the row's end.
	const last = strip.at(-1)!;
	strip[strip.length - 1] = { ...last, span: columns - strip.length + 1 } as Block;
	return {
		id: 'morning',
		title: 'Morning',
		columns,
		rows: [5, 8],
		blocks: [...strip, ...d.kids.map((kid) => personBlock(d, kid, now, span))]
	};
}

/** Muted colours for people, in family order: kids first. Dim enough to sit on an OLED all day. */
const PEOPLE_COLOURS = ['#7fa7c9', '#c99ab8', '#9cc79a', '#d9b77e', '#b0a4d6', '#d69a8c'];

/** A colour per person for the receiver's `theme.people`: the kids, then the rest of the family. */
export function peopleColours(d: Pick<TvData, 'kids' | 'family'>): Record<string, string> {
	const names = [...new Set([...d.kids, ...d.family.map((f) => f.name)])].slice(
		0,
		PEOPLE_COLOURS.length
	);
	return Object.fromEntries(names.map((n, i) => [n, PEOPLE_COLOURS[i]]));
}

/** The screen a TV should be on: the kids' columns until school's out on a school day, then Today. */
export function defaultScreen(d: Pick<TvData, 'evening' | 'kids'>, now: Date): string {
	return !d.evening && d.kids.length && sydneyHour(now) < SCHOOL_UNTIL_HOUR ? 'morning' : 'today';
}

/**
 * How bright the board is (the receiver's theme): bright 06:00–10:00, when the
 * room is in daylight and the family reads it from across it (KO, 18 Nov: too
 * dark in the morning); dim 21:00–06:00, so the OLED isn't a lamp at night.
 */
export function brightnessAt(now: Date): 'dim' | 'normal' | 'bright' {
	const h = sydneyHour(now);
	if (h >= 6 && h < 10) return 'bright';
	if (h >= 21 || h < 6) return 'dim';
	return 'normal';
}

/** Morning (by day), Today, Week and Home (when the house is connected), then `extra` (a screen put up from chat). */
export function buildScreens(d: TvData, now: Date, extra: Screen[] = []): Screen[] {
	return [morning(d, now), today(d, now), week(d, now), house(d), ...extra].filter(
		(s) => s !== null
	);
}
