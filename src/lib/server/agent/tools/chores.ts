/**
 * chores agent-tool — who does which chore on a given day.
 *
 * Wraps `$lib/server/chores > getChores`. The rotation lives in
 * `chota.config.ts > chores`; people are anyone named there (kids or
 * parents). Defaults to today in Sydney.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getChores } from '$lib/server/chores';
import { sydneyDayOfWeek } from '$lib/time';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const choresTool = tool({
	description:
		'The family chore rotation: who does what on a day. Use for "whose turn is it to…", "what are my chores", "what\'s Kid2 doing Thursday". Defaults to today.',
	inputSchema: z.object({
		day: z.enum(DAYS).describe('Day of the week; omit for today.').optional(),
		person: z.string().describe('One person by name; omit for everyone.').optional()
	}),
	execute: async ({ day, person }) => {
		const d = day ?? sydneyDayOfWeek();
		return { day: d, assignments: getChores({ day: d, person }) };
	}
});
