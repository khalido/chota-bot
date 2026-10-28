import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Things the family asked chota to keep: links, photos, voice notes,
 * documents, notes. One row each, with who sent it and who may see it.
 *
 * `scope` is set in code from where it was saved, never by the model: a direct
 * message makes it `private` to `sender`; a group makes it `family`. Search
 * applies the same rule (see tools/content.ts `visibleTo`).
 *
 * `title`, `summary` and `text` come from a model at save time (a page's text,
 * a photo described, a PDF's text, a voice note's transcript); `tags` from a
 * Jev judgment whose probabilities sit in the `decision` table.
 */
export const content = sqliteTable(
	'content',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** The family member who sent it (config name). */
		sender: text('sender').notNull(),
		scope: text('scope', { enum: ['private', 'family'] }).notNull(),
		kind: text('kind', { enum: ['link', 'photo', 'voice', 'document', 'note'] }).notNull(),
		channel: text('channel').notNull(),
		threadId: text('thread_id').notNull(),
		messageId: text('message_id').notNull(),
		url: text('url'),
		/** The kept file under data/files/, for photos, voice notes, documents. */
		file: text('file'),
		fileName: text('file_name'),
		mimetype: text('mimetype'),
		title: text('title').notNull(),
		summary: text('summary').notNull(),
		/** Full text for search: page text, transcript, PDF text, what a photo shows. */
		text: text('text').notNull(),
		/** Comma-separated, from the content-tags judgment. */
		tags: text('tags').notNull(),
		/** What the sender said with it ("for the school trip"). */
		note: text('note'),
		/** The model that wrote title/summary/text. */
		model: text('model'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		index('content_scope_idx').on(t.scope, t.sender, t.createdAt),
		index('content_url_idx').on(t.url)
	]
);
