/**
 * Conversation history — the agent's short-term memory, backed by the
 * `chat_message` table. The Telegram handler loads the last N messages for a
 * chat and passes them to the agent so a reply has context, then records the
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

/** How many recent messages to feed back as context (~6 turns). */
const HISTORY_LIMIT = 12;

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
