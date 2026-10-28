import { describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE chat_message (
	id text PRIMARY KEY NOT NULL, chat_id text NOT NULL, turn_id text NOT NULL,
	role text NOT NULL, content text NOT NULL, created_at integer NOT NULL, metadata text)`);
const db = drizzle(sqlite, { schema });
vi.mock('$lib/server/db', () => ({ db }));

const { appendMessage, loadHistory, recordSent } = await import('./history');

describe('loadHistory', () => {
	it('keeps an alert the bot sent first, as a note before the reply to it', () => {
		recordSent('tg:1', '⚠️ Job morning-print missed its 06:45 run');
		appendMessage('tg:1', 't2', 'user', 'Parent1: why?');
		expect(loadHistory('tg:1')).toEqual([
			{
				role: 'user',
				content: '[Earlier, chota sent:]\n⚠️ Job morning-print missed its 06:45 run'
			},
			{ role: 'user', content: 'Parent1: why?' }
		]);
	});

	it('leaves a history that starts with a user message alone', () => {
		appendMessage('tg:2', 't1', 'user', 'Parent1: hi');
		appendMessage('tg:2', 't1', 'assistant', 'Hello');
		expect(loadHistory('tg:2').map((m) => m.role)).toEqual(['user', 'assistant']);
	});
});
