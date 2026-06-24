import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Light conversation history — the agent's short-term context, NOT a full
 * session transcript. We store only the user message + the agent's final reply
 * text per turn (tool calls + thinking are scrubbed — cost/steps already ride
 * the `agent.run` wide event). The Telegram handler loads the last N rows for a
 * chat and passes them to the agent so replies feel continuous; persists across
 * deploys. Long-term facts live in the (deferred) memory store, not here.
 *
 * Column ideas borrowed from the eve framework review: `turnId` groups a
 * user+assistant exchange (handy for future compress/prune-by-turn), and a
 * nullable `metadata` JSON blob is an escape hatch so we don't add columns
 * speculatively. We deliberately skipped per-row token/cost columns — those
 * live in the wide event.
 */
export const chatMessage = sqliteTable(
	'chat_message',
	{
		id: text('id').primaryKey(),
		/** Telegram chat id (stringified); later also 'kiosk' / 'admin'. */
		chatId: text('chat_id').notNull(),
		/** Groups one user message with its assistant reply. */
		turnId: text('turn_id').notNull(),
		role: text('role', { enum: ['user', 'assistant'] }).notNull(),
		/** Plain text only — no tool/thinking parts. */
		content: text('content').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date()),
		/** Optional JSON escape hatch (model id, etc.). */
		metadata: text('metadata')
	},
	(t) => [index('chat_message_chat_idx').on(t.chatId, t.createdAt)]
);
