/**
 * Conversation history: sessions and their messages (`db/chat.schema.ts`). The
 * database keeps everything; `loadHistory` decides what the model sees. Today
 * that's the last N messages as text. Tool parts stay in the database, and a run
 * that wrote no text shows as a one-line note of its tools.
 *
 * Long-term facts (the deferred memory store) are a separate concern.
 */
import { and, desc, eq, gte, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { generateId, type ModelMessage } from 'ai';
import { db } from '#lib/server/db/index.ts';
import { chatMessage, chatSession } from '#lib/server/db/chat.schema.ts';
import type { ChannelName } from '#lib/server/channels/types.ts';
import { sydneyNoon, sydneyOffset, sydneyYMD, ymdAddDays } from '#lib/time.ts';
import { runNote, type ToolPart, type turnStats } from './turns';

/** What the agent has cost, across every chat, since midnight in Sydney (AI
 *  Gateway's own price per run). The daily limit reads this. */
export function spentToday(now = new Date()): number {
	// The offset at midnight, not now: on a daylight-saving day the clocks change
	// at 2 or 3 am, so midnight still has the evening before's offset.
	const ymd = sydneyYMD(now);
	const midnight = new Date(`${ymd}T00:00:00${sydneyOffset(sydneyNoon(ymdAddDays(ymd, -1)))}`);
	const row = db
		.select({ total: sql<number | null>`sum(${chatMessage.costUsd})` })
		.from(chatMessage)
		.where(gte(chatMessage.createdAt, midnight))
		.get();
	return row?.total ?? 0;
}

/** How many recent messages to feed back as context (~25 turns). Replies are
 *  short and tool calls aren't sent back, so 50 messages is a few thousand
 *  tokens: cheap on a fast model, and enough to follow a real conversation. */
const HISTORY_LIMIT = 50;

/** A fresh id grouping one turn's messages with its run. */
export const newTurnId = (): string => generateId();

/** The persistent chat a message belongs to. A family member's DMs are one chat
 *  on every channel; a group, or a DM from someone not on file, is its thread. */
export function sessionKeyFor(m: {
	threadId: string;
	isDM: boolean;
	person: { name: string } | null;
}): string {
	if (m.isDM && m.person) return `person:${m.person.name}/main`;
	return `${m.isDM ? 'chat' : 'group'}:${m.threadId}/main`;
}

/** The open session for a key, created on first use. Returns its id. */
export function openSession(key: string): string {
	db.insert(chatSession).values({ id: generateId(), key }).onConflictDoNothing().run();
	const row = db
		.select({ id: chatSession.id })
		.from(chatSession)
		.where(and(eq(chatSession.key, key), isNull(chatSession.closedAt)))
		.get();
	if (!row) throw new Error(`no open session for ${key}`);
	return row.id;
}

/** Record one message. Synchronous (better-sqlite3). */
export function appendMessage(
	sessionId: string,
	turnId: string,
	role: 'user' | 'assistant',
	content: string,
	extra: {
		sender?: string;
		channel?: ChannelName;
		parts?: ToolPart[];
		run?: ReturnType<typeof turnStats>;
		error?: string;
	} = {}
): void {
	const parts = extra.parts?.length ? JSON.stringify(extra.parts) : null;
	db.insert(chatMessage)
		.values({
			sessionId,
			turnId,
			role,
			content,
			sender: extra.sender,
			channel: extra.channel,
			parts,
			...extra.run,
			error: extra.error
		})
		.run();
	db.update(chatSession)
		.set({ lastActiveAt: new Date() })
		.where(eq(chatSession.id, sessionId))
		.run();
}

/**
 * Record a message the bot sent on its own (an alert, later a reminder), so a
 * reply to it reaches an agent that has seen it. From yaad (commit 7bb26cb):
 * without this, "done" or "why?" after an alert had nothing to refer to.
 */
export function recordSent(key: string, content: string, channel: ChannelName): void {
	appendMessage(openSession(key), newTurnId(), 'assistant', content, { channel });
}

/** A quiet turn's reply is stored with this prefix: kept as a note, never shown. */
export const QUIET_PREFIX = '(quietly) ';

/** A stored row as the context code needs it. */
export interface HistoryRow {
	role: 'user' | 'assistant';
	content: string;
	/** Set on a bot run with no text that ran tools: `content` is then empty. */
	note?: string;
}

/** Last N messages, oldest first, each user line naming its sender: several
 *  people share a group, and in a DM it's how the agent knows who "me" is. A run
 *  with neither text nor tools is left out. */
export function loadRows(sessionId: string, limit = HISTORY_LIMIT): HistoryRow[] {
	return db
		.select({
			role: chatMessage.role,
			sender: chatMessage.sender,
			content: chatMessage.content,
			parts: chatMessage.parts,
			error: chatMessage.error
		})
		.from(chatMessage)
		.where(
			and(
				eq(chatMessage.sessionId, sessionId),
				or(eq(chatMessage.role, 'user'), ne(chatMessage.content, ''), isNotNull(chatMessage.parts))
			)
		)
		.orderBy(desc(chatMessage.id))
		.limit(limit)
		.all()
		.reverse()
		.map(({ role, sender, content, parts, error }) => ({
			role,
			content: role === 'user' && sender ? `${sender}: ${content}`.trimEnd() : content,
			...(role === 'assistant' && !content && parts
				? { note: runNote(JSON.parse(parts) as ToolPart[], error) }
				: {})
		}));
}

/** Last N messages for a session, oldest first, as agent `ModelMessage[]`. */
export function loadHistory(sessionId: string, limit = HISTORY_LIMIT): ModelMessage[] {
	const msgs = loadRows(sessionId, limit).map(
		(r) => ({ role: r.role, content: r.note ?? r.content }) as ModelMessage
	);
	// History must begin with a user message (some models reject anything
	// else), but the window can start on assistant rows: a turn cut by the
	// limit, or an alert the bot sent first (recordSent). Fold those into one
	// leading user note rather than drop them: a reply to an alert needs it.
	let lead = 0;
	while (lead < msgs.length && msgs[lead].role === 'assistant') lead++;
	if (lead === 0) return msgs;
	// A quiet reply was never sent, so it can't be listed as sent.
	const earlier = msgs
		.slice(0, lead)
		.map((x) => String(x.content))
		.filter((text) => !text.startsWith(QUIET_PREFIX))
		.join('\n');
	const rest = msgs.slice(lead);
	return (
		earlier ? [{ role: 'user', content: `[Earlier, chota sent:]\n${earlier}` }, ...rest] : rest
	) as ModelMessage[];
}
