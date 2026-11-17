/**
 * `tv`: the board on the living-room TV (#lib/server/tv/cast.ts, the cast/
 * receiver). Status for anyone; showing, putting something up and turning it
 * off only when someone asks, never on a quiet turn. Taking over a TV that is
 * playing something else needs `takeOver`, which the model sets only after the
 * person said yes to it.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { AskerSchema, type Asker } from '#lib/server/tools/content.ts';
import { errorMessage, log } from '#lib/server/log.ts';
import { DEFAULT_TV, launchTv, stopTv, tvsShowing, tvState } from '#lib/server/tv/cast.ts';
import type { Screen } from '#lib/server/tv/screens.ts';

/** Why `asker` can't change the TV, or undefined. Exported for tests. */
export function refuseTv(asker: Asker | undefined): string | undefined {
	if (!asker?.sender) return "I can't tell who's asking";
	if (asker.quiet) return 'only when someone asks me to';
	return undefined;
}

/** A chat screen from the model's fields: a list, a text, an image, or text above a list. */
export function chatScreen(p: {
	title: string;
	text?: string;
	items?: { text: string; meta?: string }[];
	image?: string;
}): Screen {
	const blocks: NonNullable<Screen['blocks']> = [];
	// The receiver caps an image caption at 300 characters; longer text gets its own block.
	const caption = p.image && p.text && p.text.length <= 300 ? p.text : undefined;
	if (p.image) blocks.push({ type: 'image', src: p.image, span: 2, caption });
	if (p.text && !caption) blocks.push({ type: 'text', span: 2, title: p.title, text: p.text });
	if (p.items?.length) blocks.push({ type: 'list', span: 2, items: p.items.slice(0, 50) });
	if (!blocks.length) blocks.push({ type: 'text', span: 2, text: p.title });
	return { id: 'chat', title: p.title.slice(0, 60), columns: 2, blocks };
}

export const tvTool = tool({
	description: `The board on the TV (${DEFAULT_TV}): today's calendar, weather, buses and chores, a week view and the house. action=status says what the TV is doing. action=show puts the board up on a screen (today, week, home), waking the TV if it's off. action=put shows something from this chat (a title with text, a list, or an https image) for two hours. action=off closes the board. Only when someone asks. If the TV is playing something else, ask before taking it over, then call again with takeOver=true.`,
	inputSchema: z.object({
		action: z.enum(['status', 'show', 'put', 'off']),
		screen: z.enum(['today', 'week', 'home']).optional().describe('For show. Default today.'),
		title: z.string().max(60).optional().describe('For put: a short heading.'),
		text: z
			.string()
			.max(4000)
			.optional()
			.describe('For put: markdown-ish text (# heading, - bullets, **bold**). No HTML.'),
		items: z
			.array(z.object({ text: z.string().max(300), meta: z.string().max(60).optional() }))
			.max(50)
			.optional()
			.describe('For put: list rows, with a short right-hand note (a time, a count).'),
		image: z
			.string()
			.url()
			.startsWith('https://')
			.optional()
			.describe('For put: an https image URL.'),
		takeOver: z
			.boolean()
			.optional()
			.describe('True only after the person agreed to stop what the TV is playing.')
	}),
	contextSchema: z.object({ asker: AskerSchema.optional() }),
	execute: async ({ action, screen, title, text, items, image, takeOver }, { context }) => {
		if (action === 'status') {
			const s = tvState(DEFAULT_TV);
			if (!s) return { error: `can't see ${DEFAULT_TV}` };
			return {
				tv: s.name,
				board: tvsShowing().includes(s.name),
				state: s.standby ? 'off' : s.state,
				...(s.app ? { app: s.app } : {}),
				...(s.title ? { playing: s.title } : {})
			};
		}
		const refused = refuseTv(context?.asker);
		if (refused) return { error: refused };
		try {
			if (action === 'off') {
				const r = await stopTv();
				log('tv', `off by ${context?.asker?.sender}: ${r.ok ? 'ok' : r.error}`);
				return r;
			}
			if (action === 'put' && !title) return { error: 'put needs a title' };
			const r = await launchTv({
				show: screen ?? 'today',
				extra: action === 'put' ? chatScreen({ title: title!, text, items, image }) : undefined,
				takeOver
			});
			log(
				'tv',
				`${action}${screen ? ` ${screen}` : ''} by ${context?.asker?.sender}: ${r.ok ? 'ok' : r.error}`
			);
			return r;
		} catch (err) {
			return { error: `couldn't reach the TV: ${errorMessage(err)}` };
		}
	}
});
