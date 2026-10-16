/**
 * Conversation history — the agent's short-term memory, backed by the
 * `chat_message` table, keyed by thread id (`tg:<chatId>`, `wa:<jid>`). The
 * channel router (`$lib/server/channels`) loads the last N messages for a
 * thread and passes them to the agent so a reply has context, then records the
 * user message + the final reply text. Tool calls + thinking are NOT stored
 * (scrubbed): they're noise for context and their cost already rides the
 * `agent.run` wide event.
 *
 * Long-term facts (the deferred memory store) are a separate concern — this is
 * just a rolling window of recent turns. No compression yet; we trim by count.
 */
import { desc, eq, sql } from 'drizzle-orm';
import { generateId, type ModelMessage } from 'ai';
import { db } from '$lib/server/db';
import { chatMessage } from '$lib/server/db/chat.schema';

/** How many recent messages to feed back as context (~25 turns). Replies are
 *  short and tool calls aren't stored, so 50 messages is a few thousand
 *  tokens — cheap on a fast model, and enough to follow a real conversation. */
const HISTORY_LIMIT = 50;

/** A fresh id grouping one user message with its assistant reply. */
export const newTurnId = (): string => generateId();

/** Record one message. Synchronous (better-sqlite3). */
export function appendMessage(
	chatId: string,
	turnId: string,
	role: 'user' | 'assistant',
	content: string
): void {
	db.insert(chatMessage).values({ id: generateId(), chatId, turnId, role, content }).run();
}

/** One-off: history rows written before threads had a channel prefix were
 *  bare Telegram chat ids. Prefix them so they stay in the same thread.
 *  Idempotent; runs at boot. Delete once the box has run it (2026-10). */
export function migrateThreadKeys(): void {
	db.run(sql`UPDATE chat_message SET chat_id = 'tg:' || chat_id WHERE chat_id NOT LIKE '%:%'`);
}

/** Last N messages for a chat, oldest-first, as agent `ModelMessage[]`. */
export function loadHistory(chatId: string, limit = HISTORY_LIMIT): ModelMessage[] {
	const rows = db
		.select({ role: chatMessage.role, content: chatMessage.content })
		.from(chatMessage)
		.where(eq(chatMessage.chatId, chatId))
		// rowid (insertion order) breaks ties on equal createdAt ms so the window
		// is deterministic; createdAt leads so the (chatId, createdAt) index sorts.
		.orderBy(desc(chatMessage.createdAt), desc(sql`rowid`))
		.limit(limit)
		.all();
	const msgs = rows.reverse().map((r) => ({ role: r.role, content: r.content }) as ModelMessage);
	// A turn whose reply was empty stores only a user row, so the limit window can
	// start on an 'assistant' message — which some models reject. History must
	// begin with a user message.
	while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
	return msgs;
}
