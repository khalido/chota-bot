/**
 * GET /api/admin/logs?lines=N — tail the on-disk LogTape file at
 * `data/logs/chota.log`. Each line is a JSON object with @timestamp,
 * level, message, logger, properties. Returns them parsed + most-recent-
 * last so the UI can render in chronological order.
 *
 * Session-gated. Default tail is 200 lines (≈ what fits on a screen
 * without overwhelming); caps at 2000 to keep the endpoint cheap.
 *
 * The on-disk file is a rotating JSON-lines sink — see log.ts. When
 * rotation kicks in the latest file is still `chota.log`; the rotated
 * archives carry numeric suffixes (chota.log.1, .2, …) which we don't
 * surface here. If a future case wants historical, add a `?since=…`
 * param that glob-reads the archive files too.
 */
import { json, error } from '@sveltejs/kit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RequestHandler } from './$types';

const LOG_PATH = join(process.cwd(), 'data', 'logs', 'chota.log');
const DEFAULT_LINES = 200;
const MAX_LINES = 2000;

export interface LogEntry {
	timestamp: string; // ISO
	level: string;
	logger: string;
	message: string;
	properties?: Record<string, unknown>;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session?.userId) throw error(401, 'sign in first');

	const requested = Number(url.searchParams.get('lines') ?? DEFAULT_LINES);
	const lines = Math.max(
		1,
		Math.min(MAX_LINES, Number.isFinite(requested) ? requested : DEFAULT_LINES)
	);

	const text = await readFile(LOG_PATH, 'utf8').catch(() => '');
	if (!text) return json({ entries: [], total: 0, file: LOG_PATH });

	// Cheap tail — split + slice. The file rotates so it won't grow
	// unbounded; if memory ever became an issue we'd reverse-read a fixed
	// byte budget from EOF instead.
	const all = text.split('\n').filter((l) => l.length > 0);
	const tail = all.slice(-lines);

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
			// Skip malformed lines — usually a torn write at the file boundary.
		}
	}
	return json({ entries, total: all.length, file: LOG_PATH });
};
