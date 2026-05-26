/**
 * ticktick agent-tool — read a configured family list by internal name.
 *
 * Wraps `$lib/server/tools/ticktick`. The list arg is the stable internal
 * name from `chota.config.ts > ticktick.lists` (`shopping` etc.), never
 * the raw TickTick display name. Returns task titles + tags only — drops
 * IDs, priorities, dates, sub-items.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getList } from '$lib/server/tools/ticktick';

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
			tasks: data.tasks.map((t) => ({ title: t.title, tags: t.tags ?? [] }))
		};
	}
});
