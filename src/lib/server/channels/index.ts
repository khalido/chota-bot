/**
 * The channel router — everything about a conversation that isn't transport.
 * Adapters (Telegram now, WhatsApp next) deliver allowlisted messages as
 * `Incoming`; this decides whether to answer, queues one turn per thread,
 * keeps history, runs the agent and hands the stream back to the adapter.
 * Design: docs/agent.md §Channels.
 */
import { runAgentStream } from '$lib/server/agent';
import {
	appendMessage,
	loadHistory,
	migrateThreadKeys,
	newTurnId
} from '$lib/server/agent/history';
import { event, logErr } from '$lib/server/log';
import { ThreadQueue } from './queue';
import { telegramChannel } from './telegram';
import type { Channel, Incoming } from './types';

const SCOPE = 'channels';
/** A message delivered late (after a reconnect) is answered only if newer than this. */
const CATCH_UP_MS = 10 * 60_000;

interface Turn {
	channel: Channel;
	m: Incoming;
}

const channels: Channel[] = [];
const queue = new ThreadQueue<Turn>(runTurn);

/** Should the bot answer this at all? */
export function shouldAnswer(m: Incoming, now = Date.now()): boolean {
	if (!m.text.trim()) return false;
	if (!m.isDM && !m.isMention) return false;
	if (m.catchUp && now - m.sentAt.getTime() > CATCH_UP_MS) return false;
	return true;
}

function accept(channel: Channel, m: Incoming): Promise<void> {
	if (!shouldAnswer(m)) return Promise.resolve();
	// Not awaited by the adapter: a turn in one chat mustn't hold up the rest.
	void queue.push(m.threadId, { channel, m });
	return Promise.resolve();
}

/** In a group several people share one history, so each line names its sender. */
const asHistoryLine = (m: Incoming) =>
	m.isDM ? m.text : `${m.person?.name ?? m.senderName}: ${m.text}`;

async function runTurn(latest: Turn, skipped: Turn[]): Promise<void> {
	const { channel, m } = latest;
	const ev = event(SCOPE, 'turn', {
		channel: channel.name,
		thread: m.threadId,
		skipped: skipped.length || undefined
	});
	const stopTyping = channel.typing(m);
	try {
		// Short-term context: record the user message(s), load the recent window,
		// stream the reply, record the final text. Tool calls and thinking are
		// not stored. Messages that arrived mid-turn go in first, in order.
		const turnId = newTurnId();
		for (const t of [...skipped, latest]) {
			appendMessage(m.threadId, turnId, 'user', asHistoryLine(t.m));
		}
		const result = await runAgentStream({ messages: loadHistory(m.threadId) }, (r) =>
			channel.reply(m, r)
		);
		const reply = (await result.text).trim();
		if (reply) appendMessage(m.threadId, turnId, 'assistant', reply);
		ev.done();
	} catch (err) {
		logErr(SCOPE, `agent turn failed (${m.threadId})`, err);
		ev.fail(err);
		await channel
			.send(m.threadId, { markdown: "Sorry, I hit a snag and couldn't answer that one." })
			.catch(() => {});
	} finally {
		stopTyping();
	}
}

/** Start every configured channel. Safe to call more than once. */
export async function bootChannels(): Promise<void> {
	if (channels.length) return;
	try {
		migrateThreadKeys();
	} catch (err) {
		logErr(SCOPE, 'history key migration failed', err); // a turn will fail, not boot
	}
	for (const channel of [telegramChannel()]) {
		if (!channel) continue;
		channels.push(channel);
		await channel.start((m) => accept(channel, m));
	}
}

/** Stop polling/sockets, then let running turns finish (deploy SIGTERM). */
export async function stopChannels(): Promise<void> {
	await Promise.allSettled(channels.map((c) => c.stop()));
	await queue.drain();
	channels.length = 0;
}
