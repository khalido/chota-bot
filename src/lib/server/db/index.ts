import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const client = new Database(env.DATABASE_URL);
// Reads carry on during a write. The setting is stored in the file, so this only converts it once.
client.pragma('journal_mode = WAL');

export const db = drizzle(client, { schema });
