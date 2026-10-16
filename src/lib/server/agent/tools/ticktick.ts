/**
 * ticktick agent-tools — read a configured family list, and add to one.
 *
 * Wraps `$lib/server/tools/ticktick`. The list arg is the stable internal
 * name from `chota.config.ts > ticktick.lists` (`shopping` etc.), never
 * the raw TickTick display name. Reads return titles, tags, a due date, who
 * it's for, its section (the family list has e.g. reminders and things to
 * buy at some point) and the item's note — no IDs. The notes list's bodies
 * stay out: it holds things like card numbers.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { addToList, completeOnList, getList } from '$lib/server/tools/ticktick';
import { errorMessage } from '$lib/server/log';
import { getConfig } from '$lib/server/config';
import { parseTaskPeople } from '$lib/server/people';
import { sydneyYMD } from '$lib/time';
import { ymd as ymdSchema } from './schemas';

const LISTS = ['shopping', 'family', 'watch', 'notes'] as const;

export const ticktickTool = tool({
	description:
		'Read a family TickTick list. shopping=groceries; family=household jobs and reminders, plus bigger things to buy at some point, in sections; watch=movies/TV to see; notes=general.',
	inputSchema: z.object({
		list: z.enum(LISTS).describe('Which family list to read.')
	}),
	execute: async ({ list }) => {
		const data = await getList(list);
		if (!data) return { list, name: null, tasks: [] };
		const section = (id?: string | null) => data.columns?.find((c) => c.id === id)?.name ?? null;
		const family = getConfig().family ?? [];
		return {
			list,
			name: data.project.name,
			sections: data.columns?.map((c) => c.name) ?? [],
			tasks: data.tasks.map((t) => ({
				title: t.title,
				tags: t.tags ?? [],
				due: t.dueDate ? sydneyYMD(new Date(t.dueDate)) : null,
				section: section(t.columnId),
				for: parseTaskPeople(t.title, t.tags, family, t.assigneeUsername),
				note: list === 'notes' ? null : t.content || null
			}))
		};
	}
});

/** Notes is a TickTick NOTE list, not tasks — not something to add items to. */
const ADDABLE = ['shopping', 'family', 'watch'] as const;

export const ticktickAddTool = tool({
	description:
		'Add one item to a family TickTick list. shopping=groceries and everyday items; family=household jobs and reminders, and bigger things to buy at some point (shoes, a watch) — put it in the matching `section` and give `due` as roughly when; watch=movies/TV. One call per item. Say what you added.\n' +
		'For family todos, set `for` to who will do it: the sender ("remind me to…", "I need to…") unless they name someone else. It assigns the task in TickTick, so it shows on their brief and in reminders.\n' +
		"When the family sends a link about a show or film (a trailer, review, streaming page), read it with web_fetch, then add it to watch: the title is the show's name, and the note is 1–2 lines on what it is and where it streams, then the link.",
	inputSchema: z.object({
		list: z.enum(ADDABLE).describe('Which family list to add to.'),
		title: z
			.string()
			.min(1)
			.max(200)
			.describe('The item, short and plain: "milk", "Kid1 school shoes".'),
		due: ymdSchema
			.describe('Optional Sydney date to do or buy it by, e.g. next month for something to buy.')
			.optional(),
		section: z
			.string()
			.describe(
				"The list's section, by its name as a read shows it. A wrong name returns the real ones."
			)
			.optional(),
		note: z
			.string()
			.max(1000)
			.describe("Optional detail shown under the item, e.g. a watch item's summary and link.")
			.optional(),
		for: z.string().describe('Family member responsible, by name — usually the sender.').optional()
	}),
	execute: async ({ list, title, due, note, section, for: who }) => {
		// Assignment needs the person's TickTick email (`family[].email`).
		const family = getConfig().family ?? [];
		const person = who
			? family.find((m) => m.aliases.some((a) => a.toLowerCase() === who.toLowerCase()))
			: undefined;
		const notAssigned = !who
			? undefined
			: !person
				? `${who} isn't in the family list`
				: !person.email
					? `no TickTick email on file for ${person.name}`
					: undefined;
		try {
			const task = await addToList(list, title, {
				due,
				content: note,
				assignee: person?.email,
				section
			});
			return {
				added: task.title,
				list,
				section: section ?? null,
				due: due ?? null,
				note: note ?? null,
				// What TickTick saved, not what we asked for.
				assignedTo:
					task.assigneeUsername && task.assigneeUsername === person?.email ? person.name : null,
				...(notAssigned && { notAssigned })
			};
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
