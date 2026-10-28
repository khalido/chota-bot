/**
 * Saved content: links, photos, voice notes, documents and notes the family
 * asks chota to keep, each with a title, summary, full text and tags, so the
 * agent can find them again ("that article about sleep I saved").
 *
 * Saving: a link's page text comes from Exa; a PDF's text from unpdf (on the
 * box); a voice note's from its transcript. One small vision model then writes
 * the title, summary and, for a photo or a scanned PDF, the text it can see.
 * Jev tags the item from that (decisions/content-tags.json), and the verdict
 * goes in the `decision` table like every other judgment.
 *
 * Privacy is decided here, not by the model: saved in a direct message, an
 * item is private to its sender; saved in a group, it belongs to the family.
 * A search in a DM sees the asker's private items and the family's; a search
 * in a group sees only the family's. Ideas from yaad's `save_link`.
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, like, or, type SQL } from 'drizzle-orm';
import { generateText, Output } from 'ai';
import Exa from 'exa-js';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { content, decision } from '$lib/server/db/schema';
import { decideBooleans, questionsHash, type Question } from '$lib/server/decide';
import spec from '$lib/server/decisions/content-tags.json';
import { log, logErr } from '$lib/server/log';

const SCOPE = 'content';
/** Reads photos and PDFs; the same small model as the group photo gate. */
const MODEL = 'google/gemini-3.5-flash-lite';
/** How much text goes to the model and into the row. */
const MODEL_CHARS = 30_000;
const KEEP_CHARS = 100_000;

export type ContentRow = typeof content.$inferSelect;

/** A file that came with the message being answered (set by the router). */
export interface Attachment {
	kind: 'photo' | 'voice' | 'document';
	path: string;
	mimetype: string;
	fileName?: string;
	/** Already known: a voice note's transcript, a PDF's text. */
	text?: string;
}

/** Who is asking and where — from the router, never from the model. */
export interface Asker {
	/** Family member name; null when the channel couldn't tell. */
	sender: string | null;
	isDM: boolean;
	channel: string;
	threadId: string;
	messageId: string;
	attachment?: Attachment;
	/** An untagged group message handled quietly: lists only, never a save. */
	quiet?: boolean;
}

/** The rows `asker` may see. In a group, never anyone's private items. */
export function visibleTo(asker: Pick<Asker, 'sender' | 'isDM'>): SQL {
	const family = eq(content.scope, 'family');
	if (!asker.isDM || !asker.sender) return family;
	return or(family, and(eq(content.scope, 'private'), eq(content.sender, asker.sender)))!;
}

/** Where a new item goes: a DM makes it private to the sender. */
export const scopeFor = (asker: Pick<Asker, 'isDM'>) => (asker.isDM ? 'private' : 'family');

export async function pdfText(data: Buffer): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(data));
	const { text } = await extractText(pdf, { mergePages: true });
	return text.replace(/[ \t]+\n/g, '\n').trim();
}

let exa: Exa | undefined;

async function fetchPage(url: string): Promise<{ title: string; text: string }> {
	if (!env.EXA_API_KEY) throw new Error('Set EXA_API_KEY in .env');
	exa ??= new Exa(env.EXA_API_KEY);
	const r = await exa.getContents([url], { text: { maxCharacters: KEEP_CHARS } });
	const page = r.results[0];
	if (!page?.text) throw new Error(`no text for ${url}`);
	return { title: page.title ?? url, text: page.text };
}

const Described = z.object({
	title: z.string().describe('A short title, under 10 words.'),
	summary: z.string().describe('2–3 plain sentences: what it is and why someone kept it.'),
	text: z
		.string()
		.describe(
			'For a photo or scanned page: every readable word in it, then a line on what it shows. Otherwise empty.'
		)
});

/** Title, summary and (for images and scans) the visible text, from one model call. */
async function describe(
	what: string,
	note: string | undefined,
	body: { text: string } | { file: Buffer; mediaType: string }
) {
	const intro = `A ${what} a family member saved${note ? `, with the note "${note}"` : ''}.`;
	const { output } = await generateText({
		model: MODEL,
		output: Output.object({ schema: Described }),
		messages: [
			{
				role: 'user',
				content:
					'text' in body
						? [{ type: 'text', text: `${intro}\n\n${body.text.slice(0, MODEL_CHARS)}` }]
						: [
								{ type: 'text', text: intro },
								{ type: 'file', data: body.file, mediaType: body.mediaType }
							]
			}
		],
		abortSignal: AbortSignal.timeout(60_000)
	});
	return output;
}

const TAG_QUESTIONS: Record<string, Question & { type: 'boolean' }> = Object.fromEntries(
	Object.entries(spec.tags).map(([tag, meaning]) => [
		tag,
		{ type: 'boolean', instructions: `${spec.instructions} Tag "${tag}": ${meaning}` }
	])
);
const TAGS_HASH = questionsHash(TAG_QUESTIONS);

/** The tag names, for the search tool's description. */
export const TAG_NAMES = Object.keys(spec.tags);

/** Jev's tags for an item; none if Jev fails (it's a network call). */
async function tagsFor(item: { title: string; summary: string; text: string }, asker: Asker) {
	try {
		const state = { title: item.title, summary: item.summary, text: item.text.slice(0, 2000) };
		const { probabilities, model } = await decideBooleans(
			'content-tags',
			spec.model,
			state,
			TAG_QUESTIONS
		);
		const tags = Object.entries(probabilities)
			.filter(([, p]) => p >= spec.threshold)
			.sort((a, b) => b[1] - a[1])
			.map(([t]) => t);
		await db.insert(decision).values({
			id: randomUUID(),
			kind: 'content-tags',
			threadId: asker.threadId,
			messageId: asker.messageId,
			model,
			questionsHash: TAGS_HASH,
			probabilities: JSON.stringify(probabilities),
			pick: tags.join(',') || 'none',
			acted: tags.length > 0
		});
		return tags;
	} catch (err) {
		logErr(SCOPE, 'tagging failed; saving untagged', err);
		return [];
	}
}

export interface SaveInput {
	/** A web page to keep. */
	url?: string;
	/** Keep the file that came with this message. */
	attachment?: boolean;
	/** A note to keep on its own, or a note about the url/file. */
	note?: string;
}

/** Save one item for `asker`. Returns the existing row if the same link was saved before. */
export async function saveContent(input: SaveInput, asker: Asker): Promise<ContentRow> {
	if (!asker.sender) throw new Error("Can't tell who's asking, so I can't save it for them.");
	if (asker.quiet) throw new Error('Save only when someone asks to keep something.');
	const scope = scopeFor(asker);
	const base = {
		sender: asker.sender,
		scope,
		channel: asker.channel,
		threadId: asker.threadId,
		messageId: asker.messageId,
		note: input.note?.trim() || null,
		model: MODEL
	} as const;

	let item: Omit<typeof content.$inferInsert, keyof typeof base | 'tags'>;
	if (input.url) {
		const url = input.url.trim();
		const [dupe] = await db
			.select()
			.from(content)
			.where(and(eq(content.url, url), eq(content.sender, asker.sender), eq(content.scope, scope)))
			.limit(1);
		if (dupe) return dupe;
		const page = await fetchPage(url);
		const d = await describe('web page', base.note ?? undefined, { text: page.text });
		item = { kind: 'link', url, title: d.title || page.title, summary: d.summary, text: page.text };
	} else if (input.attachment) {
		const a = asker.attachment;
		if (!a) throw new Error('There is no photo, voice note or document with this message.');
		const file = { file: a.path, fileName: a.fileName ?? null, mimetype: a.mimetype };
		if (a.kind === 'photo') {
			const d = await describe('photo', base.note ?? undefined, {
				file: await readFile(a.path),
				mediaType: a.mimetype
			});
			item = { kind: 'photo', ...file, title: d.title, summary: d.summary, text: d.text };
		} else if (a.kind === 'voice') {
			const said = a.text ?? '';
			const d = await describe('voice note transcript', base.note ?? undefined, { text: said });
			item = { kind: 'voice', ...file, title: d.title, summary: d.summary, text: said };
		} else {
			// A PDF with a text layer is read on the box; a scanned PDF or an image
			// goes to the model. Other types (Word, zip…) are kept but not read.
			const own = a.text ?? '';
			const name = a.fileName ?? 'file';
			const readable = a.mimetype === 'application/pdf' || a.mimetype.startsWith('image/');
			if (own.length < 300 && !readable) {
				item = {
					kind: 'document',
					...file,
					title: name,
					summary: `A ${a.mimetype} file, kept but not read (only PDFs and images are).`,
					text: [name, base.note].filter(Boolean).join(' ')
				};
			} else {
				const d = await describe(
					`document (${name})`,
					base.note ?? undefined,
					own.length >= 300
						? { text: own }
						: { file: await readFile(a.path), mediaType: a.mimetype }
				);
				const text = own.length >= 300 ? own : d.text || own;
				item = { kind: 'document', ...file, title: d.title, summary: d.summary, text };
			}
		}
	} else if (input.note?.trim()) {
		const d = await describe('note', undefined, { text: input.note });
		item = { kind: 'note', title: d.title, summary: d.summary, text: input.note.trim() };
	} else {
		throw new Error('Nothing to save: give a link, a note, or send a file with the message.');
	}

	const text = (item.text ?? '').slice(0, KEEP_CHARS);
	const tags = await tagsFor({ title: item.title, summary: item.summary, text }, asker);
	const [row] = await db
		.insert(content)
		.values({ ...base, ...item, text, tags: tags.join(',') })
		.returning();
	log(SCOPE, `saved ${row.kind} #${row.id} (${row.scope}) tags=${row.tags || '-'}`);
	return row;
}

/** Items `asker` may see that match every word of `query`, newest first. */
export async function searchContent(
	query: string,
	asker: Pick<Asker, 'sender' | 'isDM'>,
	opts: { kind?: ContentRow['kind']; tag?: string; limit?: number } = {}
): Promise<ContentRow[]> {
	const words = query
		.toLowerCase()
		.split(/\s+/)
		.filter((w) => w.length > 1)
		.slice(0, 6);
	const matches = words.map((w) => {
		const p = `%${w}%`;
		return or(
			like(content.title, p),
			like(content.summary, p),
			like(content.text, p),
			like(content.tags, p),
			like(content.note, p),
			like(content.url, p)
		)!;
	});
	const filters = [visibleTo(asker), ...matches];
	if (opts.kind) filters.push(eq(content.kind, opts.kind));
	if (opts.tag) filters.push(like(content.tags, `%${opts.tag}%`));
	return db
		.select()
		.from(content)
		.where(and(...filters))
		.orderBy(desc(content.createdAt))
		.limit(opts.limit ?? 8);
}
