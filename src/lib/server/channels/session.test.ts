import { beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '#lib/server/db/schema.ts';
import type { Channel, Incoming } from './types';

// The router with its real history on a real database; only the channels and
// the model are stubbed. Run through bootChannels, the way messages really arrive.
const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE chat_session (
	id text PRIMARY KEY NOT NULL, key text NOT NULL, agent text NOT NULL DEFAULT 'main', parent_id text,
	created_at integer NOT NULL, last_active_at integer NOT NULL, closed_at integer);
CREATE UNIQUE INDEX chat_session_open_key ON chat_session (key) WHERE closed_at IS NULL;
CREATE TABLE chat_message (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL, session_id text NOT NULL, turn_id text NOT NULL,
	role text NOT NULL, sender text, channel text, content text NOT NULL, parts text,
	model text, provider text, steps integer, tokens_in integer, tokens_out integer,
	cached_tokens integer, cost_usd real, error text,
	created_at integer NOT NULL);`);
const db = drizzle(sqlite, { schema });
vi.mock('#lib/server/db/index.ts', () => ({ db }));

const started: Array<(m: Incoming) => Promise<void>> = [];
const fakeChannel = (name: 'telegram' | 'whatsapp'): Channel =>
	({
		name,
		start: async (on: (m: Incoming) => Promise<void>) => void started.push(on),
		stop: async () => {},
		typing: () => () => {},
		reply: async () => {},
		send: async () => {}
	}) as unknown as Channel;
vi.mock('./telegram', () => ({ telegramChannel: () => fakeChannel('telegram') }));
vi.mock('./whatsapp', () => ({ whatsappChannel: () => fakeChannel('whatsapp') }));
vi.mock('./triage', () => ({ triage: vi.fn(), triageHint: vi.fn(), photoIsActionable: vi.fn() }));
vi.mock('./files', () => ({ pdfText: vi.fn(), saveFile: vi.fn() }));
vi.mock('#lib/server/transcribe.ts', () => ({ transcribeAudio: vi.fn() }));
vi.mock('#lib/server/agent/prompts.ts', () => ({ GROUP_HINT: '[group]' }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));

const runs: { messages: { role: string; content: unknown }[]; sessionId: string }[] = [];
vi.mock('#lib/server/agent/index.ts', () => ({
	describeChatError: (e: unknown) => ({ kind: 'x', message: String(e) }),
	EMPTY_REPLY: 'empty',
	finalText: async (r: { text: string }) => r.text,
	runAgentStream: async (args: {
		messages: { role: string; content: unknown }[];
		options: { sessionId: string };
		onStepEnd: (step: unknown) => void;
	}) => {
		runs.push({ messages: args.messages, sessionId: args.options.sessionId });
		args.onStepEnd({
			content: [
				{ type: 'tool-call', toolCallId: 'c1', toolName: 'bus', input: {} },
				{ type: 'tool-result', toolCallId: 'c1', output: { next: '8:12' } }
			],
			response: { modelId: 'test/model' },
			usage: { inputTokens: 100, outputTokens: 5 }
		});
		if (String(args.messages.at(-1)?.content).includes('fail now')) throw new Error('model down');
		return { text: 'the 8:12' };
	}
}));

const { bootChannels, stopChannels } = await import('./index');

const person = { name: 'Parent1' } as Incoming['person'];
const dm = (channel: 'telegram' | 'whatsapp', messageId: string, text: string): Incoming => ({
	threadId: channel === 'telegram' ? 'tg:1' : 'wa:1@s.whatsapp.net',
	channel,
	messageId,
	person,
	senderName: 'P',
	text,
	isDM: true,
	isMention: false,
	catchUp: false,
	sentAt: new Date()
});

async function send(on: (m: Incoming) => Promise<void>, m: Incoming) {
	await on(m);
	await vi.waitFor(() => expect(lastUser(m.text)).toBeTruthy());
	await turnsDone();
}
const lastUser = (text: string) =>
	sqlite.prepare('SELECT id FROM chat_message WHERE content = ?').get(text);
// A turn is done once its run row exists.
const turnsDone = () =>
	vi.waitFor(() => {
		const runs = sqlite
			.prepare('SELECT count(*) c FROM chat_message WHERE steps IS NOT NULL')
			.get() as { c: number };
		const turns = sqlite.prepare('SELECT count(DISTINCT turn_id) c FROM chat_message').get() as {
			c: number;
		};
		expect(runs.c).toBe(turns.c);
	});

describe('one chat per person', () => {
	beforeAll(async () => {
		await bootChannels();
		expect(started).toHaveLength(2);
		await send(started[1], dm('whatsapp', 'm1', 'next bus?'));
		await send(started[0], dm('telegram', 'm2', 'and after that?'));
	});

	it('uses one opaque session across WhatsApp and Telegram', () => {
		const sessions = sqlite.prepare('SELECT id, key FROM chat_session').all() as {
			id: string;
			key: string;
		}[];
		expect(sessions.map((s) => s.key)).toEqual(['person:Parent1/main']);
		expect(sessions[0].id).not.toContain('Parent1');
		expect(runs.map((r) => r.sessionId)).toEqual([sessions[0].id, sessions[0].id]);
	});

	it('lets the second channel see the first one, with senders named', () => {
		expect(runs[1].messages.map((m) => m.content)).toEqual([
			'Parent1: next bus?',
			'the 8:12',
			'Parent1: and after that?'
		]);
	});

	it('stores the sender, channel, tool part and run', () => {
		const rows = sqlite
			.prepare('SELECT role, sender, channel, content, parts FROM chat_message ORDER BY id')
			.all() as { role: string; sender: string; channel: string; content: string; parts: string }[];
		expect(rows[0]).toMatchObject({
			role: 'user',
			sender: 'Parent1',
			channel: 'whatsapp',
			content: 'next bus?'
		});
		expect(rows[2].channel).toBe('telegram');
		expect(JSON.parse(rows[1].parts)[0]).toMatchObject({
			name: 'bus',
			status: 'ok',
			output: { next: '8:12' }
		});
		expect(rows[1]).toMatchObject({ role: 'assistant', content: 'the 8:12' });
		expect(
			sqlite
				.prepare('SELECT model, steps, tokens_in, cached_tokens FROM chat_message WHERE id = 2')
				.get()
		).toEqual({ model: 'test/model', steps: 1, tokens_in: 100, cached_tokens: null });
		const { total } = sqlite.prepare('SELECT sum(tokens_in) total FROM chat_message').get() as {
			total: number;
		};
		expect(total).toBe(200);
	});

	it('keeps the tool calls and numbers of a run that fails, and tells the next run', async () => {
		await send(started[1], dm('whatsapp', 'm3', 'fail now'));
		const row = sqlite
			.prepare(
				"SELECT content, parts, error, steps, tokens_in FROM chat_message WHERE role = 'assistant' ORDER BY id DESC"
			)
			.get() as { content: string; parts: string; error: string; steps: number; tokens_in: number };
		expect(row).toMatchObject({ content: '', error: 'x', steps: 1, tokens_in: 100 });
		expect(JSON.parse(row.parts)[0].name).toBe('bus');
		await send(started[1], dm('whatsapp', 'm4', 'did that work?'));
		expect(runs.at(-1)?.messages.map((m) => m.content)).toContain(
			'[ran tools: bus (ok); then the run failed]'
		);
	});

	it('stops cleanly', async () => {
		expect.assertions(1);
		await expect(stopChannels()).resolves.toBeUndefined();
	});
});
