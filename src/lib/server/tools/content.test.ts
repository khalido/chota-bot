import { beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE content (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL, sender text NOT NULL, scope text NOT NULL,
	kind text NOT NULL, channel text NOT NULL, thread_id text NOT NULL, message_id text NOT NULL,
	url text, file text, file_name text, mimetype text, title text NOT NULL, summary text NOT NULL,
	text text NOT NULL, tags text NOT NULL, note text, model text, created_at integer NOT NULL)`);
const db = drizzle(sqlite, { schema });
vi.mock('$lib/server/db', () => ({ db }));
vi.mock('$lib/server/log', () => ({ log: vi.fn(), logErr: vi.fn() }));

const { searchContent, scopeFor } = await import('./content');

const row = (sender: string, scope: 'private' | 'family', title: string) => ({
	sender,
	scope,
	kind: 'link' as const,
	channel: 'telegram',
	threadId: 't',
	messageId: 'm',
	title,
	summary: 'about sleep',
	text: 'sleep research',
	tags: 'health'
});

beforeAll(async () => {
	await db
		.insert(schema.content)
		.values([
			row('Parent1', 'private', 'Parent1 private sleep article'),
			row('Parent2', 'private', 'Parent2 private sleep article'),
			row('Kid1', 'family', 'Family sleep article')
		]);
});

const titles = async (asker: { sender: string | null; isDM: boolean }) =>
	(await searchContent('sleep', asker)).map((r) => r.title).sort();

describe('content privacy', () => {
	it('saves in a DM as private, in a group as family', () => {
		expect(scopeFor({ isDM: true })).toBe('private');
		expect(scopeFor({ isDM: false })).toBe('family');
	});

	it('a DM search sees the asker’s private items and the family’s, not others’ private ones', async () => {
		expect(await titles({ sender: 'Parent1', isDM: true })).toEqual([
			'Family sleep article',
			'Parent1 private sleep article'
		]);
	});

	it('a group search never shows private items, even the asker’s own', async () => {
		expect(await titles({ sender: 'Parent1', isDM: false })).toEqual(['Family sleep article']);
	});

	it('an unknown asker sees family items only', async () => {
		expect(await titles({ sender: null, isDM: true })).toEqual(['Family sleep article']);
	});

	it('needs every word to match', async () => {
		expect(await searchContent('sleep nonsenseword', { sender: 'Parent1', isDM: true })).toEqual(
			[]
		);
	});
});
