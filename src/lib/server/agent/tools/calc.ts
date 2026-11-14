/**
 * calc agent-tool — arithmetic, unit and currency conversion, and the time in
 * another city, so the model never works numbers out itself. Wraps
 * `#lib/server/tools/calc` (mathjs; daily currency rates; Intl time zones).
 */
import { tool } from 'ai';
import { z } from 'zod';
import { calculate, timeIn } from '#lib/server/tools/calc/index.ts';
import { errorMessage } from '#lib/server/log.ts';

export const calcTool = tool({
	description:
		'Exact calculator. Use it for any arithmetic, percentages, unit conversions ("10 ft to m", "3 days in hours", "20 c in f"), currency conversions ("100 usd in aud"; a bare amount converts to AUD, rates are daily), and "what time is it in X" (time there, and the gap from Sydney). Never work numbers out yourself. Pass one of expression or timeIn.',
	inputSchema: z.object({
		expression: z
			.string()
			.min(1)
			.max(200)
			.describe('One sum, as written: "15% of 80", "2^10", "5 ft + 2 in to cm", "£20 * 3".')
			.optional(),
		timeIn: z
			.string()
			.min(1)
			.describe('A city, state, country or airport code: "Chicago", "Karachi", "LHR".')
			.optional()
	}),
	execute: async ({ expression, timeIn: place }) => {
		try {
			if (expression !== undefined) {
				const result = await calculate(expression);
				if (result === null) return { error: `not a sum I can work out: ${expression}` };
				if (result.answer === '') return { error: result.note ?? 'no answer' };
				return result;
			}
			if (place !== undefined) {
				return timeIn(place) ?? { error: `I don't know a place called "${place}"` };
			}
			return { error: 'give an expression or a place (timeIn)' };
		} catch (err) {
			return { error: `calc failed: ${errorMessage(err)}` };
		}
	}
});
