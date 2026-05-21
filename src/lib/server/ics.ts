/**
 * Minimal iCal (RFC 5545) parser — just enough for the all-day calendar feeds
 * chota ingests (currently the NSW school-term calendar). Extracts VEVENTs as
 * plain `{ title, start, end }` with date-only `YYYY-MM-DD` values.
 *
 * Deliberately small and dependency-free. The feeds we read are all-day events
 * with no recurrence and no timezones, so the heavy machinery a full library
 * (node-ical & co.) brings — RRULE expansion, VTIMEZONE, moment-timezone —
 * would be dead weight. If a feed with recurring or timed cross-timezone
 * events ever lands, swap this file's internals for such a library; callers
 * see the same `IcsEvent[]` and need not change.
 */

export interface IcsEvent {
	/** VEVENT `SUMMARY`, trimmed. */
	title: string;
	/** Inclusive start date, `YYYY-MM-DD`. */
	start: string;
	/** Inclusive end date, `YYYY-MM-DD`; equals `start` for single-day events. */
	end: string;
}

/**
 * Parse the events out of an iCal feed. Handles RFC 5545 line folding (a line
 * starting with a space/tab continues the one before it) and the all-day
 * `VALUE=DATE` form. iCal's `DTEND` is *exclusive*, so it's rolled back a day
 * to an inclusive end date. Events without a SUMMARY or DTSTART are skipped.
 */
export function parseIcs(text: string): IcsEvent[] {
	const logical: string[] = [];
	for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
		if (/^[ \t]/.test(raw) && logical.length) logical[logical.length - 1] += raw.slice(1);
		else logical.push(raw);
	}

	const events: IcsEvent[] = [];
	let title: string | null = null;
	let start: string | null = null;
	let end: string | null = null;
	for (const line of logical) {
		if (line === 'BEGIN:VEVENT') {
			title = start = end = null;
		} else if (line === 'END:VEVENT') {
			if (title && start) events.push({ title, start, end: end ?? start });
		} else {
			const colon = line.indexOf(':');
			if (colon < 0) continue;
			// A property is `NAME;param=…:value` — the name ends at the first `;` or `:`.
			const name = line.slice(0, colon).split(';')[0];
			const value = line.slice(colon + 1);
			if (name === 'SUMMARY') title = value.trim();
			else if (name === 'DTSTART') start = icsDate(value);
			else if (name === 'DTEND') end = icsDate(value, -1);
		}
	}
	return events;
}

/**
 * An iCal `YYYYMMDD` (or `YYYYMMDDThhmmss…`) date → `YYYY-MM-DD`, optionally
 * shifted by `offsetDays` — used to turn an exclusive `DTEND` into an inclusive
 * end date.
 */
function icsDate(value: string, offsetDays = 0): string {
	const ymd = value.slice(0, 8);
	const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
	d.setUTCDate(d.getUTCDate() + offsetDays);
	return d.toISOString().slice(0, 10);
}
