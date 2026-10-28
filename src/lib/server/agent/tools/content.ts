/**
 * save + saved agent-tools — keep a link, photo, voice note, document or note,
 * and find it again later.
 *
 * Wraps `$lib/server/tools/content`. Who is asking, whether it's a DM, and the
 * file that came with the message arrive as tool context from the channel
 * router, never from the model — that is what keeps a DM save private to its
 * sender and keeps private items out of group answers. Called without context
 * (the admin chat), save refuses and search sees family items only.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { saveContent, searchContent, TAG_NAMES, type Asker } from '$lib/server/tools/content';

export const AskerSchema = z.object({
	sender: z.string().nullable().optional(),
	isDM: z.boolean().optional(),
	channel: z.string().optional(),
	threadId: z.string().optional(),
	messageId: z.string().optional(),
	attachment: z
		.object({
			kind: z.enum(['photo', 'voice', 'document']),
			path: z.string(),
			mimetype: z.string(),
			fileName: z.string().optional(),
			text: z.string().optional()
		})
		.optional(),
	quiet: z.boolean().optional()
});
export type ContentContext = z.infer<typeof AskerSchema>;

const askerOf = (c: ContentContext | undefined): Asker => ({
	sender: c?.sender ?? null,
	isDM: c?.isDM ?? false,
	channel: c?.channel ?? 'admin',
	threadId: c?.threadId ?? 'admin',
	messageId: c?.messageId ?? '',
	attachment: c?.attachment,
	quiet: c?.quiet
});

const day = (d: Date) =>
	d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export const saveTool = tool({
	description:
		'Save something to find later: a web link, the photo / voice note / document sent with this message, or a short note. ' +
		'Use when the message is just a link, or someone says "save this", "keep this", "remember this link". ' +
		'Reads it and writes a title, summary and tags (takes ~10s). Saved in a direct message it is private to the sender; in a group it is shared with the family. Say which in your reply.',
	inputSchema: z.object({
		url: z.string().url().describe('The link to save.').optional(),
		attachment: z
			.boolean()
			.describe('True to save the photo, voice note or document sent with this message.')
			.optional(),
		note: z
			.string()
			.describe('What they said about it ("for the school trip"), or the note itself.')
			.optional()
	}),
	contextSchema: AskerSchema,
	execute: async (input, { context }) => {
		const row = await saveContent(input, askerOf(context));
		return {
			saved: row.id,
			kind: row.kind,
			title: row.title,
			summary: row.summary,
			tags: row.tags ? row.tags.split(',') : [],
			private: row.scope === 'private'
		};
	}
});

export const savedTool = tool({
	description:
		'Search what the family saved with the save tool: links, photos, voice notes, documents, notes. ' +
		'Use for "that article I saved about…", "find the permission note PDF", "what recipes have we saved". ' +
		'In a direct message it includes the asker’s private items; in a group only family items.',
	inputSchema: z.object({
		query: z.string().describe('Words to look for: "sleep article", "excursion permission".'),
		kind: z.enum(['link', 'photo', 'voice', 'document', 'note']).optional(),
		tag: z
			.string()
			.describe(`Optional tag: ${TAG_NAMES.join(', ')}.`)
			.optional()
	}),
	contextSchema: AskerSchema,
	execute: async ({ query, kind, tag }, { context }) => {
		const rows = await searchContent(query, askerOf(context), { kind, tag });
		return {
			found: rows.map((r) => ({
				id: r.id,
				kind: r.kind,
				title: r.title,
				summary: r.summary.slice(0, 300),
				url: r.url,
				tags: r.tags,
				savedBy: r.sender,
				saved: day(r.createdAt),
				private: r.scope === 'private',
				hasFile: !!r.file
			}))
		};
	}
});
