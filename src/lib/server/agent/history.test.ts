import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '#lib/server/db/schema.ts';
import { turnStats } from './turns';

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

const { appendMessage, loadHistory, openSession, QUIET_PREFIX, recordSent, sessionKeyFor } =
	await import('./history');

describe('sessionKeyFor', () => {
	const person = { name: 'Parent1' };

	it('gives a family member one chat on every channel', () => {
		const wa = sessionKeyFor({ threadId: 'wa:1@s.whatsapp.net', isDM: true, person });
		const tg = sessionKeyFor({ threadId: 'tg:1', isDM: true, person });
		expect(wa).toBe('person:Parent1/main');
		expect(tg).toBe(wa);
	});

	it('keeps a group apart from its members, and each group apart', () => {
		expect(sessionKeyFor({ threadId: 'wa:g1@g.us', isDM: false, person })).toBe(
			'group:wa:g1@g.us/main'
		);
	});

	it('keeps a DM from someone not on file in its own thread', () => {
		expect(sessionKeyFor({ threadId: 'tg:9', isDM: true, person: null })).toBe('chat:tg:9/main');
	});
});

describe('openSession', () => {
	it('returns the same open session for a key', () => {
		expect(openSession('person:Parent1/main')).toBe(openSession('person:Parent1/main'));
	});

	it('starts a new session once the old one is closed, keeping both', () => {
		const first = openSession('person:Kid1/main');
		sqlite.prepare('UPDATE chat_session SET closed_at = 1 WHERE id = ?').run(first);
		expect(openSession('person:Kid1/main')).not.toBe(first);
	});
});

describe('loadHistory', () => {
	it('keeps an alert the bot sent first, as a note before the reply to it', () => {
		const key = 'person:A/main';
		recordSent(key, '⚠️ Job morning-print missed its 06:45 run', 'telegram');
		const id = openSession(key);
		appendMessage(id, 't2', 'user', 'why?', { sender: 'Parent1', channel: 'telegram' });
		expect(loadHistory(id)).toEqual([
			{
				role: 'user',
				content: '[Earlier, chota sent:]\n⚠️ Job morning-print missed its 06:45 run'
			},
			{ role: 'user', content: 'Parent1: why?' }
		]);
	});

	it('merges one person across channels, in order', () => {
		const id = openSession('person:B/main');
		appendMessage(id, 't1', 'user', 'on whatsapp', { sender: 'B', channel: 'whatsapp' });
		appendMessage(id, 't1', 'assistant', 'one', { channel: 'whatsapp' });
		appendMessage(id, 't2', 'user', 'on telegram', { sender: 'B', channel: 'telegram' });
		expect(loadHistory(id).map((m) => m.content)).toEqual([
			'B: on whatsapp',
			'one',
			'B: on telegram'
		]);
	});

	it('keeps sessions apart', () => {
		const a = openSession('group:g1/main');
		const b = openSession('group:g2/main');
		appendMessage(a, 't1', 'user', 'hello', { sender: 'C' });
		expect(loadHistory(b)).toEqual([]);
	});

	it('shows a tool-only run as a note, keeping the tool output out of context', () => {
		const id = openSession('person:D/main');
		const part = {
			id: 'c1',
			name: 'ticktick_add',
			input: {},
			status: 'ok' as const,
			output: 'secret'
		};
		appendMessage(id, 'tools-1', 'user', 'add milk', { sender: 'D' });
		appendMessage(id, 'tools-1', 'assistant', '', { parts: [part] });
		appendMessage(id, 'tools-2', 'user', 'thanks', { sender: 'D' });
		expect(loadHistory(id).map((m) => m.content)).toEqual([
			'D: add milk',
			'[ran tools: ticktick_add (ok)]',
			'D: thanks'
		]);
		const row = sqlite.prepare('SELECT parts FROM chat_message WHERE turn_id = ? AND role = ?');
		const { parts } = row.get('tools-1', 'assistant') as { parts: string };
		expect(JSON.parse(parts)[0]).toMatchObject({ name: 'ticktick_add', output: 'secret' });
	});

	it('says when a run that ran tools then failed, so the action is not repeated', () => {
		const id = openSession('person:G/main');
		const part = { id: 'c1', name: 'ticktick_add', input: {}, status: 'ok' as const, output: 'x' };
		appendMessage(id, 'f1', 'user', 'add milk', { sender: 'G' });
		appendMessage(id, 'f1', 'assistant', '', { parts: [part], error: 'network' });
		expect(loadHistory(id).at(-1)?.content).toBe(
			'[ran tools: ticktick_add (ok); then the run failed]'
		);
	});

	it('leaves out a run with neither text nor tools', () => {
		const id = openSession('person:H/main');
		appendMessage(id, 'e1', 'user', 'hello', { sender: 'H' });
		appendMessage(id, 'e1', 'assistant', '', { error: 'network' });
		expect(loadHistory(id).map((m) => m.content)).toEqual(['H: hello']);
	});

	it('does not list a quiet reply as sent', () => {
		const id = openSession('person:I/main');
		appendMessage(id, 'q1', 'assistant', `${QUIET_PREFIX}added it`);
		appendMessage(id, 'q2', 'user', 'hi', { sender: 'I' });
		expect(loadHistory(id).map((m) => m.content)).toEqual(['I: hi']);
	});

	it('only sends the most recent messages, but keeps every row', () => {
		const id = openSession('person:E/main');
		for (let i = 0; i < 5; i++) appendMessage(id, `t${i}`, 'user', String(i), { sender: 'E' });
		expect(loadHistory(id, 2).map((m) => m.content)).toEqual(['E: 3', 'E: 4']);
		const count = sqlite
			.prepare('SELECT count(*) c FROM chat_message WHERE session_id = ?')
			.get(id) as { c: number };
		expect(count.c).toBe(5);
	});
});

describe('run numbers', () => {
	it('sit on the assistant row, unknown ones null, and user rows have none', () => {
		const id = openSession('person:F/main');
		appendMessage(id, 'turn-1', 'user', 'hi', { sender: 'F' });
		appendMessage(id, 'turn-1', 'assistant', 'hello', {
			run: { ...turnStats([]), model: 'm', steps: 2, tokensIn: 10 }
		});
		const rows = sqlite
			.prepare(
				'SELECT role, model, steps, tokens_in, cost_usd FROM chat_message WHERE turn_id = ? ORDER BY id'
			)
			.all('turn-1');
		expect(rows).toEqual([
			{ role: 'user', model: null, steps: null, tokens_in: null, cost_usd: null },
			{ role: 'assistant', model: 'm', steps: 2, tokens_in: 10, cost_usd: null }
		]);
	});
});
