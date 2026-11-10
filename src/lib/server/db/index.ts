import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { DATABASE_URL } from '$app/env/private';

if (!DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(DATABASE_URL);
// Reads carry on during a write. The setting is stored in the file, so this only converts it once.
client.pragma('journal_mode = WAL');

export const db = drizzle(client, { schema });
