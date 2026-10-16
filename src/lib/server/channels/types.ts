/**
 * The channel contract — what the shared router (`./index.ts`) sees of
 * Telegram, WhatsApp, and whatever comes next. Adapters own transport,
 * identity and formatting; the router owns allowlist, group gate, queue,
 * history and the agent run. Shape borrowed from Vercel's Chat SDK (see
 * docs/agent.md §Channels) without the SDK.
 */
import type { FamilyMember } from '$lib/config';
import type { ChotaStreamResult } from '$lib/server/agent';

export type ChannelName = 'telegram' | 'whatsapp';

export interface Incoming {
	/** `tg:<chatId>` / `wa:<jid>` — the history and queue key. */
	threadId: string;
	channel: ChannelName;
	/** Platform message id, for replies, reactions and dedupe. */
	messageId: string;
	/** The family member who sent it, if the adapter could tell. */
	person: FamilyMember | null;
	/** Display name as the platform gives it (used when `person` is null). */
	senderName: string;
	/** Text or caption, with mentions of the bot rewritten to `@chota`. */
	text: string;
	isDM: boolean;
	/** @chota, or a reply to one of the bot's messages. */
	isMention: boolean;
	/** Delivered late, after a reconnect (WhatsApp `append`). */
	catchUp: boolean;
	sentAt: Date;
}

export type Outgoing =
	| { markdown: string }
	| { image: Buffer; caption?: string }
	| { document: Buffer; fileName: string; mimetype?: string };

export interface Channel {
	readonly name: ChannelName;
	/** Connect and deliver allowlisted messages to `onMessage`. Resolves once
	 *  started; doesn't wait for the connection to stay up. */
	start(onMessage: (m: Incoming) => Promise<void>): Promise<void>;
	/** Disconnect, finishing any in-flight send. */
	stop(): Promise<void>;
	send(threadId: string, out: Outgoing): Promise<void>;
	/** Show the agent's reply as it streams — however this channel can
	 *  (Telegram drafts with a thinking status; WhatsApp typing, then one
	 *  message). The router reads the final text from `result` for history. */
	reply(m: Incoming, result: ChotaStreamResult): Promise<void>;
	/** "Working on it" signal while the agent runs; returns a stop function. */
	typing(m: Incoming): () => void;
	react?(m: Incoming, emoji: string): Promise<void>;
}
