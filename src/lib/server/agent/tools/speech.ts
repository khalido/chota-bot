/**
 * announce agent-tool — chota says something out loud on the speaker at home
 * ("tell the kids dinner's ready"). Wraps `#lib/server/speech.ts`.
 *
 * Who may: `speech.announcers` (family names) when set, else anyone the
 * channel knows. Never from a quiet group turn. At most `speech.perHour`
 * announcements an hour through this tool; quiet hours come from speak().
 *
 * Regular or important (KO, 10 Nov 2026): a regular announcement is spoken over
 * the music, turned down; an important one pauses it. Anyone who may announce
 * may mark one important. Later, with the Cast speakers: a regular one skips a
 * speaker that is playing something, an important one interrupts it.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getConfig } from '#lib/server/config.ts';
import { AskerSchema, type Asker } from '#lib/server/tools/content.ts';
import { MAX_CHARS, SpeechRefused, speak } from '#lib/server/speech.ts';
import { errorMessage, log } from '#lib/server/log.ts';

const HOUR_MS = 60 * 60_000;
const recent: number[] = [];

/** Why `asker` can't announce now, or undefined. Exported for tests. */
export function refuse(asker: Asker | undefined, now = Date.now()): string | undefined {
	const cfg = getConfig().speech;
	if (!cfg) return 'speaking is not set up';
	if (!asker?.sender) return "I can't tell who's asking";
	if (asker.quiet) return 'only when someone asks me to';
	if (cfg.announcers && !cfg.announcers.includes(asker.sender))
		return `${asker.sender} can't make announcements; ask a parent`;
	while (recent.length && now - recent[0] > HOUR_MS) recent.shift();
	if (recent.length >= (cfg.perHour ?? 6)) return 'that is enough announcements for this hour';
	return undefined;
}

export const announceTool = tool({
	description:
		'Say something out loud on the speaker at home, for when someone asks you to tell the house ' +
		'something ("tell the kids dinner\'s ready", "announce we leave in 10"). Write `text` as the exact ' +
		'words to be heard, in your own voice: short, spoken, names first when it is for someone. ' +
		'Not for answering the person who asked; reply to them as usual after.',
	inputSchema: z.object({
		text: z.string().min(1).max(MAX_CHARS).describe('The words to say, as they should be heard.'),
		mood: z
			.string()
			.max(120)
			.optional()
			.describe('How to say it, if it matters: "cheerful", "a bit urgent", "gentle, it is late".'),
		important: z
			.boolean()
			.optional()
			.describe(
				'Only when they say it is urgent or important ("tell them NOW", "it\'s urgent"): the music is paused for it. Otherwise leave it out, and it is spoken over the music, turned down.'
			)
	}),
	contextSchema: z.object({ asker: AskerSchema.optional() }),
	execute: async ({ text, mood, important }, { context }) => {
		const no = refuse(context.asker);
		if (no) return { said: false, reason: no };
		try {
			const r = await speak(text, { mood, important });
			recent.push(Date.now());
			log(
				'announce',
				`${context.asker?.sender} via ${context.asker?.channel}: ${text.length} chars`
			);
			return {
				said: true,
				text,
				...(important ? { important: true } : {}),
				...(r.cached ? { cached: true } : {})
			};
		} catch (error) {
			if (error instanceof SpeechRefused) return { said: false, reason: error.message };
			return { said: false, reason: `the speaker failed: ${errorMessage(error)}` };
		}
	}
});
