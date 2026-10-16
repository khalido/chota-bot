/**
 * calendar agent-tool — Google Calendar events for a range or a specific day.
 *
 * Wraps `$lib/server/tools/calendar`. The LLM passes one of:
 *   - `range`:  `today` | `tomorrow` | `week` | … — common quick lookups
 *   - `date`:   Sydney-local `YYYY-MM-DD`          — a specific day
 *   - `search`: 1–4 wordings, Google's free-text search (title, place, notes)
 *               a year ahead, or back with `past`
 *
 * The agent's system prompt carries today's Sydney date (see `agent/index.ts`),
 * so the model can resolve "next Monday" / "this Friday" itself and pass the
 * absolute date. Returns a slim per-event shape: title, ISO date + weekday,
 * time, location, and the family members the event mentions (via
 * `parseEventPeople`), capped at 15 with a `truncated` flag.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
	getCalendar,
	getCalendarBetween,
	searchEvents,
	type CalendarEvent
} from '$lib/server/tools/calendar';
import { getConfig } from '$lib/server/config';
import { parseEventPeople } from '$lib/server/people';
import { errorMessage } from '$lib/server/log';
import {
	sydneyDayOfWeek,
	sydneyNoon,
	sydneyTimeOnDay,
	sydneyTimeRange,
	sydneyYMD
} from '$lib/time';
import { ymd as ymdSchema } from './schemas';

const MAX_EVENTS = 15;

export const calendarTool = tool({
	description:
		'Family Google Calendar. Use exactly one mode:\n' +
		'  - `range` for a named span (today / tomorrow / week / next_week / weekend) — prefer this for spans, never call `date` seven times in a row.\n' +
		'  - `date` for one specific Sydney YYYY-MM-DD.\n' +
		'  - `search` to find events by words in the title, place or notes, up to a year ahead — "when are we going to the Opera House", "when\'s our next dinner out". Give 1–4 alternative wordings (["opera", "Opera House"], ["dinner", "restaurant"]); set `past: true` for "when did we last…".\n' +
		"Today's Sydney date is in the system prompt — resolve relative phrases yourself.",
	inputSchema: z
		.object({
			range: z
				.enum(['today', 'tomorrow', 'week', 'next_week', 'weekend'])
				.describe(
					'Named span — today | tomorrow | week (rolling 7 days from now, incl. today) | next_week (the Mon–Sun block AFTER this one) | weekend (the closest upcoming Sat–Sun; includes today if it is already the weekend).'
				)
				.optional(),
			date: ymdSchema
				.describe(
					'Specific Sydney date, e.g. "2026-06-01". Use only for a single named day; for spans, use `range`.'
				)
				.optional(),
			search: z
				.array(z.string().min(1))
				.min(1)
				.max(4)
				.describe(
					'1–4 alternative words or phrases; an event matching any of them is returned. Expand abbreviations ("vb" → "volleyball") and add likely synonyms yourself.'
				)
				.optional(),
			past: z.boolean().describe('With `search`: look back a year instead of ahead.').optional()
		})
		.refine((d) => [d.range, d.date, d.search].filter((v) => v !== undefined).length === 1, {
			message: 'pass exactly one of `range`, `date`, or `search`'
		}),
	execute: async ({ range, date, search, past }) => {
		const family = getConfig().family ?? [];
		let events: CalendarEvent[];
		try {
			events = search
				? await searchAny(search, past ? 'past' : 'upcoming')
				: date
					? await fetchByDate(date)
					: await getCalendar({ range });
		} catch (err) {
			return { error: `calendar unavailable: ${errorMessage(err)}` };
		}
		// For a backward search the most recent matches matter, so keep the tail.
		// (The API returns up to 250 matches in start order — plenty for a family
		// calendar; a term matching more would lose the newest. `past` is ignored
		// without `search`.)
		const kept = past ? events.slice(-MAX_EVENTS) : events.slice(0, MAX_EVENTS);
		return {
			events: kept.map((e) => ({
				title: e.summary,
				date: sydneyYMD(e.start),
				day: sydneyDayOfWeek(e.start),
				time: e.isAllDay ? 'all-day' : sydneyTimeRange(e.start, e.end),
				location: e.location ?? null,
				people: parseEventPeople(e.summary, family)
			})),
			truncated: events.length > MAX_EVENTS
		};
	}
});

/** Run each wording through the Calendar API search; merge, dedupe, sort. */
async function searchAny(
	terms: string[],
	direction: 'upcoming' | 'past'
): Promise<CalendarEvent[]> {
	const lists = await Promise.all(terms.map((query) => searchEvents({ query, direction })));
	const byId = new Map<string, CalendarEvent>();
	for (const e of lists.flat()) byId.set(e.id || `${e.summary}|${e.start.toISOString()}`, e);
	return [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/**
 * Resolve a YYYY-MM-DD string to a Sydney-local day-window and fetch.
 * The anchor is noon Sydney (`sydneyNoon`) so
 * `sydneyTimeOnDay('00:00', anchor)` lands on the right calendar day even
 * across DST transitions (the AEDT offset shift only flips at 02:00/03:00).
 */
async function fetchByDate(date: string): Promise<CalendarEvent[]> {
	const anchor = sydneyNoon(date);
	const start = sydneyTimeOnDay('00:00', anchor);
	const end = sydneyTimeOnDay('23:59', anchor);
	return getCalendarBetween(start, end);
}
