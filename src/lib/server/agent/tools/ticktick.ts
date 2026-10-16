/**
 * ticktick agent-tools — read a configured family list, and add to one.
 *
 * Wraps `$lib/server/tools/ticktick`. The list arg is the stable internal
 * name from `chota.config.ts > ticktick.lists` (`shopping` etc.), never
 * the raw TickTick display name. Reads return titles, tags and a due date
 * (the buying list uses due dates as "buy around then") — no IDs.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { addToList, getList } from '$lib/server/tools/ticktick';
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
				due: t.dueDate ? sydneyYMD(new Date(t.dueDate)) : null
			}))
		};
	}
});

/** Notes is a TickTick NOTE list, not tasks — not something to add items to. */
const ADDABLE = ['shopping', 'buying', 'family', 'watch'] as const;

export const ticktickAddTool = tool({
	description:
		'Add one item to a family TickTick list. shopping=groceries and everyday items; buying=bigger purchases bought over time (shoes, a watch) — give `due` as roughly when to buy; family=shared todos; watch=movies/TV. One call per item. Say what you added.',
	inputSchema: z.object({
		list: z.enum(ADDABLE).describe('Which family list to add to.'),
		title: z
			.string()
			.min(1)
			.max(200)
			.describe('The item, short and plain: "milk", "Kid1 school shoes".'),
		due: ymdSchema
			.describe('Optional Sydney date to buy/do it by, e.g. next month for a buying item.')
			.optional()
	}),
	execute: async ({ list, title, due }) => {
		try {
			const task = await addToList(list, title, { due });
			return { added: task.title, list, due: due ?? null };
		} catch (err) {
			return {
				error: `couldn't add to ${list}: ${errorMessage(err)}`
			};
		}
	}
});
