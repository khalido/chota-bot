import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = () => new Date();

/**
 * One persistent agent's conversation. `key` is `owner/agent`: one chat per
 * person across WhatsApp and Telegram (`person:<name>/main`), one per group
 * (`group:<threadId>/main`), later one per project. `id` is opaque because it
 * leaves the box as the AI Gateway session id: no names or numbers in it.
 * Starting fresh closes a row and opens another with the same key.
 */
export const chatSession = sqliteTable(
	'chat_session',
	{
		id: text('id').primaryKey(),
		key: text('key').notNull(),
		agent: text('agent').notNull().default('main'),
		/** The session that started this one (a project or research agent). */
		parentId: text('parent_id'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
		lastActiveAt: integer('last_active_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now),
		closedAt: integer('closed_at', { mode: 'timestamp_ms' })
	},
	(t) => [
		uniqueIndex('chat_session_open_key')
			.on(t.key)
			.where(sql`closed_at IS NULL`)
	]
);

/**
 * Every message, kept for good, for analysis as well as context. What the model
 * sees is decided by the code that builds context (`agent/history.ts`).
 * `id` increases in insertion order, so it orders a session.
 *
 * Each bot run writes exactly one assistant row, even with no text, and that row
 * holds the run's numbers. They're null on user rows and on messages the bot sent
 * on its own, so `steps IS NOT NULL` finds runs, and `sum(cost_usd)` needs no filter.
 */
export const chatMessage = sqliteTable(
	'chat_message',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: text('session_id').notNull(),
		/** Groups the user message(s) with the reply. */
		turnId: text('turn_id').notNull(),
		role: text('role', { enum: ['user', 'assistant'] }).notNull(),
		/** Who said it: a family member's name, or the platform's display name. */
		sender: text('sender'),
		channel: text('channel', { enum: ['telegram', 'whatsapp'] }),
		/** The text, without the sender's name. Empty when a turn only ran tools. */
		content: text('content').notNull(),
		/** JSON `ToolPart[]` (`agent/turns.ts`): each tool call with its result. */
		parts: text('parts'),
		model: text('model'),
		/** The provider AI Gateway ended on. */
		provider: text('provider'),
		steps: integer('steps'),
		tokensIn: integer('tokens_in'),
		tokensOut: integer('tokens_out'),
		cachedTokens: integer('cached_tokens'),
		costUsd: real('cost_usd'),
		/** What kind of failure ended the run; the numbers cover its finished steps. */
		error: text('error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(now)
	},
	(t) => [
		index('chat_message_session_idx').on(t.sessionId, t.id),
		index('chat_message_turn_idx').on(t.turnId)
	]
);
