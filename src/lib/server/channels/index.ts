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
import { transcribeAudio } from '$lib/server/transcribe';
import { saveFile } from './files';
import { ThreadQueue } from './queue';
import { photoIsActionable, triage, triageHint } from './triage';
import { telegramChannel } from './telegram';
import { whatsappChannel } from './whatsapp';
import type { Channel, Incoming } from './types';

const SCOPE = 'channels';
/** A message delivered late (after a reconnect) is answered only if newer than this. */
const CATCH_UP_MS = 10 * 60_000;

interface Turn {
	channel: Channel;
	m: Incoming;
}

// Shared via globalThis so a dev reload of this module can stop the previous
// sockets and pollers before starting new ones (see bootChannels).
declare global {
	var __chotaChannels: Channel[] | undefined;
}
if (!globalThis.__chotaChannels) globalThis.__chotaChannels = [];
const channels: Channel[] = globalThis.__chotaChannels;
const queue = new ThreadQueue<Turn>(runTurn);

/** Should the bot answer this at all? */
export function shouldAnswer(m: Incoming, now = Date.now()): boolean {
	if (!m.text.trim() && !m.media) return false;
	if (!m.isDM && !m.isMention) return false;
	if (m.catchUp && now - m.sentAt.getTime() > CATCH_UP_MS) return false;
	return true;
}

/** The last few lines of each group, for the triage judgment's context —
 *  the bot's own replies included, so Jev can tell a follow-up to the bot. */
const recentLines = new Map<string, string[]>();
const RECENT = 6;
const BOT_LINE = 'chota (bot)';
/** A bot reply is clipped in the context: Jev needs the topic, not the essay. */
const BOT_CLIP = 300;

/** A group's recent lines; after a restart, seeded from stored history (the
 *  addressed turns — quiet replies were never shown, so they're left out). */
function recentFor(threadId: string): string[] {
	let lines = recentLines.get(threadId);
	if (!lines) {
		lines = loadHistory(threadId, RECENT)
			.filter((h) => !(h.role === 'assistant' && String(h.content).startsWith('(quietly)')))
			.map((h) => (h.role === 'user' ? String(h.content) : botLine(String(h.content))));
		recentLines.set(threadId, lines);
	}
	return lines;
}

function remember(threadId: string, line: string) {
	recentLines.set(threadId, [...recentFor(threadId), line].slice(-RECENT));
}

/** A follow-up needs the bot to have spoken in the last two lines — a code
 *  check on top of Jev, since a wrong reply in the group is the costly mistake. */
export const followsBot = (recent: string[]) =>
	recent.slice(-2).some((line) => line.startsWith(`${BOT_LINE}:`));

const botLine = (reply: string) =>
	`${BOT_LINE}: ${reply.length > BOT_CLIP ? `${reply.slice(0, BOT_CLIP)}…` : reply}`;

/** Untagged group messages go to Jev — WhatsApp only for now. */
const triages = (m: Incoming) => m.channel === 'whatsapp' && !m.isDM && !m.catchUp;

/** For an untagged photo: Jev can't see images, so the agent decides, quietly. */
const PHOTO_HINT =
	"[A photo posted in the group, not addressed to you. If it's an event flyer, school notice, schedule or something to buy, act on it with your tools (a dated Family reminder with the details in its note, a list item). Nobody sees your reply in the group, only a reaction, so keep it to a few words. Otherwise do nothing.]";

function accept(channel: Channel, m: Incoming): Promise<void> {
	// Not awaited by the adapter: a turn in one chat mustn't hold up the rest.
	route(channel, m).catch((err) => logErr(SCOPE, `routing failed (${m.threadId})`, err));
	return Promise.resolve();
}

async function route(channel: Channel, incoming: Incoming): Promise<void> {
	let m = incoming;
	const addressed = shouldAnswer(m);
	const triaged = !addressed && triages(m);
	// A voice note is a typed message once transcribed; it then takes the
	// same path (answered, or triaged by Jev in the group).
	if ((addressed || triaged) && m.media?.kind === 'audio') {
		const audio = await m.media.download();
		await saveFile(m.threadId, m.messageId, m.media.mimetype, audio);
		const said = await transcribeAudio(audio);
		if (!said) return;
		m = { ...m, text: `[voice note] ${said}`, media: undefined };
	}
	const recent = m.isDM ? [] : recentFor(m.threadId);
	if (!m.isDM) remember(m.threadId, asHistoryLine(m));

	if (addressed) return void queue.push(m.threadId, { channel, m });
	if (!triaged) return;
	// Quiet turns get their own queue key, so they never merge with a message
	// someone addressed to the bot (which must get its reply).
	const quietKey = `${m.threadId}#quiet`;
	if (m.media?.kind === 'image') {
		const image = await m.media.download();
		if (!(await photoIsActionable(image, m.media.mimetype, m.text))) return;
		const media = { ...m.media, download: async () => image };
		return void queue.push(quietKey, { channel, m: { ...m, media, triage: { hint: PHOTO_HINT } } });
	}
	if (!m.text.trim()) return;
	const hit = await triage(m, recent);
	if (!hit) return;
	// A follow-up to the bot is answered like a tagged message.
	if (hit.reply) {
		if (followsBot(recent)) void queue.push(m.threadId, { channel, m });
		return;
	}
	void queue.push(quietKey, { channel, m: { ...m, triage: { hint: triageHint(hit) } } });
}

/** Kids read the family group: answers there stay short and plain. */
const GROUP_HINT =
	'[Family group chat, kids included: answer in 1–3 short lines a 10-year-old follows.]';

/** Each line names its sender — several people share a group's history, and
 *  in a DM it's how the agent knows who "me" is. A photo is marked, not kept. */
const asHistoryLine = (m: Incoming) => {
	const photo = m.media?.kind === 'image' ? '[photo] ' : '';
	return `${m.person?.name ?? m.senderName}: ${photo}${m.text}`.trimEnd();
};

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
		const messages = loadHistory(m.threadId);
		// This turn's own extras ride on the last message only — a triage note
		// and the photo itself. History keeps the text line.
		const last = messages.at(-1);
		const hint = m.triage?.hint ?? (m.isDM ? undefined : GROUP_HINT);
		if (last?.role === 'user' && (hint || m.media?.kind === 'image')) {
			const text = hint ? `${last.content}\n\n${hint}` : String(last.content);
			if (m.media?.kind === 'image') {
				const image = await m.media.download();
				await saveFile(m.threadId, m.messageId, m.media.mimetype, image);
				messages[messages.length - 1] = {
					role: 'user',
					content: [
						{ type: 'text', text },
						{ type: 'file', data: image, mediaType: m.media.mimetype }
					]
				};
			} else {
				messages[messages.length - 1] = { role: 'user', content: text };
			}
		}
		const result = await runAgentStream({ messages }, (r) => channel.reply(m, r));
		const reply = (await result.text).trim();
		// A quiet turn's reply was never shown: keep it as a note, so later
		// turns don't think they said it to anyone.
		if (reply)
			appendMessage(m.threadId, turnId, 'assistant', m.triage ? `(quietly) ${reply}` : reply);
		if (reply && !m.triage && !m.isDM) remember(m.threadId, botLine(reply));
		ev.done();
	} catch (err) {
		logErr(SCOPE, `agent turn failed (${m.threadId})`, err);
		ev.fail(err);
		// A quiet (triaged) turn fails silently — nobody asked.
		if (!m.triage) {
			await channel
				.send(m.threadId, { markdown: "Sorry, I hit a snag and couldn't answer that one." })
				.catch(() => {});
		}
	} finally {
		stopTyping();
	}
}

/** Start every configured channel. Calling it again (a dev reload re-runs the
 *  init hook) stops the running channels first — two WhatsApp sockets on one
 *  login knock each other off, two Telegram pollers get 409s. */
export async function bootChannels(): Promise<void> {
	if (channels.length) {
		await Promise.allSettled(channels.map((c) => c.stop()));
		channels.length = 0;
	}
	try {
		migrateThreadKeys();
	} catch (err) {
		logErr(SCOPE, 'history key migration failed', err); // a turn will fail, not boot
	}
	for (const channel of [telegramChannel(), whatsappChannel()]) {
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
