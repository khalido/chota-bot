/**
 * iCal (RFC 5545) feeds → plain events, via node-ical (line folding, escapes,
 * TZID timezones, all-day dates). Two shapes for chota's two feeds:
 *
 * - `parseIcsEvents` — timed events as instants (Sentral's timetable export).
 * - `parseIcsDays` — all-day events as `YYYY-MM-DD` ranges (the NSW
 *   school-term calendar).
 *
 * node-ical keys events by UID, so two VEVENTs sharing a UID merge into one
 * (neither feed does this today).
 *
 * No RRULE expansion: neither feed recurs. If one starts to, node-ical exposes
 * `rrule` on the raw component.
 */
import ical, { type ParameterValue } from 'node-ical';
import { sydneyYMD } from '$lib/time';

export interface IcsEvent {
	/** VEVENT `SUMMARY`, trimmed. */
	summary: string;
	start: Date;
	/** iCal `DTEND` — exclusive. Equals `start` when the feed omits it. */
	end: Date;
	allDay: boolean;
	location?: string;
	description?: string;
}

export interface IcsDay {
	/** VEVENT `SUMMARY`, trimmed. */
	title: string;
	/** Inclusive start date, `YYYY-MM-DD`. */
	start: string;
	/** Inclusive end date, `YYYY-MM-DD`; equals `start` for single-day events. */
	end: string;
}

/** Every VEVENT with a SUMMARY and DTSTART; anything else is skipped. */
export function parseIcsEvents(text: string): IcsEvent[] {
	const events: IcsEvent[] = [];
	for (const c of Object.values(ical.sync.parseICS(text))) {
		if (c?.type !== 'VEVENT' || !c.start || c.summary === undefined) continue;
		events.push({
			summary: textOf(c.summary)!.trim(),
			start: c.start,
			end: c.end ?? c.start,
			allDay: c.start.dateOnly === true,
			location: textOf(c.location),
			description: textOf(c.description)
		});
	}
	return events;
}

/**
 * Day-granular events as inclusive date ranges (iCal's exclusive `DTEND` rolled
 * back). Mostly all-day, but the NSW feed has a few timed at Sydney midnight
 * (`TZID="AUS Eastern Standard Time"`) — those are read as Sydney days.
 */
export function parseIcsDays(text: string): IcsDay[] {
	return parseIcsEvents(text).map((e) => {
		const start = e.allDay ? localYMD(e.start) : sydneyYMD(e.start);
		let end = start;
		if (e.end > e.start) {
			// Exclusive end → the last day the event covers.
			end = e.allDay ? localYMD(e.end, -1) : sydneyYMD(new Date(e.end.getTime() - 1));
		}
		return { title: e.summary, start, end };
	});
}

/** A property's text — node-ical gives `{ params, val }` when it carries parameters (e.g. `LANGUAGE=`). */
function textOf(v: ParameterValue | undefined): string | undefined {
	return typeof v === 'string' ? v : v?.val;
}

/**
 * node-ical puts an all-day date at local midnight of the *server's*
 * timezone, so read it back with local getters, not UTC ones.
 */
function localYMD(d: Date, offsetDays = 0): string {
	const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offsetDays);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}
