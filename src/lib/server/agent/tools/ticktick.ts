/**
 * ticktick agent-tools — read a configured family list, and add to one.
 *
 * Wraps `$lib/server/tools/ticktick`. The list arg is the stable internal
 * name from `chota.config.ts > ticktick.lists` (`shopping` etc.), never
 * the raw TickTick display name. Reads return titles, tags, a due date (the
 * buying list uses due dates as "buy around then") and the item's note — no
 * IDs. The notes list's bodies stay out: it holds things like card numbers.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { addToList, completeOnList, getList } from '$lib/server/tools/ticktick';
import { errorMessage } from '$lib/server/log';
import { sydneyYMD } from '$lib/time';
import { ymd as ymdSchema } from './schemas';

const LISTS = ['shopping', 'buying', 'family', 'watch', 'notes'] as const;

export const ticktickTool = tool({
	description:
		'Read the family TickTick list. shopping=groceries, buying=longer wishlist, family=shared todos, watch=movies/TV to see, notes=general.',
	inputSchema: z.object({
		list: z.enum(LISTS).describe('Which family list to read.')
	}),
	execute: async ({ list }) => {
		const data = await getList(list);
		if (!data) return { list, name: null, tasks: [] };
		return {
			list,
			name: data.project.name,
			tasks: data.tasks.map((t) => ({
				title: t.title,
				tags: t.tags ?? [],
				due: t.dueDate ? sydneyYMD(new Date(t.dueDate)) : null,
				note: list === 'notes' ? null : t.content || null
			}))
		};
	}
});

/** Notes is a TickTick NOTE list, not tasks — not something to add items to. */
const ADDABLE = ['shopping', 'buying', 'family', 'watch'] as const;

export const ticktickAddTool = tool({
	description:
		'Add one item to a family TickTick list. shopping=groceries and everyday items; buying=bigger purchases bought over time (shoes, a watch) — give `due` as roughly when to buy; family=shared todos; watch=movies/TV. One call per item. Say what you added.\n' +
		"When the family sends a link about a show or film (a trailer, review, streaming page), read it with web_fetch, then add it to watch: the title is the show's name, and the note is 1–2 lines on what it is and where it streams, then the link.",
	inputSchema: z.object({
		list: z.enum(ADDABLE).describe('Which family list to add to.'),
		title: z
			.string()
			.min(1)
			.max(200)
			.describe('The item, short and plain: "milk", "Kid1 school shoes".'),
		due: ymdSchema
			.describe('Optional Sydney date to buy/do it by, e.g. next month for a buying item.')
			.optional(),
		note: z
			.string()
			.max(1000)
			.describe("Optional detail shown under the item, e.g. a watch item's summary and link.")
			.optional()
	}),
	execute: async ({ list, title, due, note }) => {
		try {
			const task = await addToList(list, title, { due, content: note });
			return { added: task.title, list, due: due ?? null, note: note ?? null };
		} catch (err) {
			return {
				error: `couldn't add to ${list}: ${errorMessage(err)}`
			};
		}
	}
});

export const ticktickDoneTool = tool({
	description:
		'Tick items off a family TickTick list (mark them done): "got the milk", "we watched Wildwood", "bought the boots". Give each item as it appears on the list; several at once is fine. Only reports items it actually ticked off — if one is not found or matches several, say so and ask, never guess.',
	inputSchema: z.object({
		list: z.enum(ADDABLE).describe('Which family list.'),
		titles: z.array(z.string().trim().min(1)).min(1).max(20).describe('The items to tick off.')
	}),
	execute: async ({ list, titles }) => {
		try {
			const r = await completeOnList(list, titles);
			return {
				list,
				done: r.done,
				...(r.failed.length && { failed: r.failed }),
				...(r.notFound.length && { notFound: r.notFound }),
				...(r.ambiguous.length && { ambiguous: r.ambiguous })
			};
		} catch (err) {
			return { error: `couldn't update ${list}: ${errorMessage(err)}` };
		}
	}
});
