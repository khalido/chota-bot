/**
 * calendar agent-tool — Google Calendar events for a range or a specific day.
 *
 * Wraps `$lib/server/tools/calendar`. The LLM passes one of:
 *   - `range`: `today` | `tomorrow` | `week`  — common quick lookups
 *   - `date`:  Sydney-local `YYYY-MM-DD`       — a specific day
 *
 * The agent's system prompt carries today's Sydney date (see `agent/index.ts`),
 * so the model can resolve "next Monday" / "this Friday" itself and pass the
 * absolute date. Returns a slim per-event shape: title, Sydney-local date/time,
 * and the family members the event mentions (via `parseEventPeople`).
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
import { sydneyDateShort, sydneyTimeOnDay, sydneyTimeRange } from '$lib/time';

export const calendarTool = tool({
	description:
		'Family Google Calendar. Three modes:\n' +
		'  - `range` for a named span (today / tomorrow / week / next_week / weekend) — prefer this for spans, never call `date` seven times in a row.\n' +
		'  - `date` for a specific Sydney YYYY-MM-DD when asked about one named day.\n' +
		'  - `query` to find events matching a phrase across the next 60 days — use for "when is the next X" or "any X coming up". Expand abbreviations ("vb" → "volleyball") yourself before searching.\n' +
		"Today's Sydney date is in the system prompt — resolve relative phrases yourself.",
	inputSchema: z
		.object({
			range: z
				.enum(['today', 'tomorrow', 'week', 'next_week', 'weekend'])
				.describe(
					'Named span — today | tomorrow | week (rolling 7 days from now, incl. today) | next_week (the Mon–Sun block AFTER this one) | weekend (the closest upcoming Sat–Sun; includes today if it is already the weekend).'
				)
				.optional(),
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
				.describe(
					'Specific Sydney date, e.g. "2026-06-01". Use only for a single named day; for spans, use `range`.'
				)
				.optional(),
			query: z
				.string()
				.min(1)
				.describe(
					'Substring to find in event titles, case-insensitive. Searches the next 60 days. Use for "when is the next X" or "any X coming up" — not for fetching all events in a span.'
				)
				.optional()
		})
		.refine((d) => d.range || d.date || d.query, {
			message: 'pass one of `range`, `date`, or `query`'
		}),
	execute: async ({ range, date, query }) => {
		const family = getConfig().family ?? [];
		const events = query
			? await searchEvents({ query })
			: date
				? await fetchByDate(date)
				: await getCalendar({ range });
		return events.map((e) => ({
			title: e.summary,
			date: sydneyDateShort(e.start),
			time: e.isAllDay ? 'all-day' : sydneyTimeRange(e.start, e.end),
			people: parseEventPeople(e.summary, family)
		}));
	}
});

/**
 * Resolve a YYYY-MM-DD string to a Sydney-local day-window and fetch.
 * The anchor `new Date(date + 'T12:00:00+10:00')` is noon Sydney AEST so
 * `sydneyTimeOnDay('00:00', anchor)` lands on the right calendar day even
 * across DST transitions (the AEDT offset shift only flips at 02:00/03:00).
 */
async function fetchByDate(date: string): Promise<CalendarEvent[]> {
	const anchor = new Date(`${date}T12:00:00+10:00`);
	const start = sydneyTimeOnDay('00:00', anchor);
	const end = sydneyTimeOnDay('23:59', anchor);
	return getCalendarBetween(start, end);
}
