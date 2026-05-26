/**
 * /admin/logs — load the latest tail of the on-disk LogTape file on
 * first paint. The page then auto-refreshes by polling /api/admin/logs
 * every 30s (only while the tab is visible).
 *
 * Reads the file directly here rather than going through the API
 * endpoint via SvelteKit's internal `fetch` — same code, one fewer
 * hop, and avoids any cookie-propagation surprise.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LogEntry } from '../../api/admin/logs/+server';
import type { PageServerLoad } from './$types';

const LOG_PATH = join(process.cwd(), 'data', 'logs', 'chota.log');
const DEFAULT_LINES = 200;

export const load: PageServerLoad = async () => {
	const text = await readFile(LOG_PATH, 'utf8').catch(() => '');
	if (!text) return { entries: [], total: 0, file: LOG_PATH };
	const all = text.split('\n').filter((l) => l.length > 0);
	const tail = all.slice(-DEFAULT_LINES);
	const entries: LogEntry[] = [];
	for (const line of tail) {
		try {
			const parsed = JSON.parse(line);
			entries.push({
				timestamp: parsed['@timestamp'] ?? '',
				level: parsed.level ?? 'INFO',
				logger: parsed.logger ?? '',
				message: parsed.message ?? '',
				properties: parsed.properties
			});
		} catch {
			// Skip malformed lines (torn-write at file boundary).
		}
	}
	return { entries, total: all.length, file: LOG_PATH };
};
