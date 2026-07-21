/**
 * GET /api/health — a plain-text status dump for `curl` / SSH.
 *
 *   curl -s pop-os/api/health                              # human-readable
 *   curl -s pop-os/api/health?format=json | jq .version    # "did my deploy land?"
 *
 * Running build's commit + uptime, a DB liveness probe, system load/memory,
 * and every job's next run and last outcome. No auth: it carries no secrets,
 * and a health check you can't reach is useless. `?format=json` returns the
 * same data as JSON for tooling.
 *
 * The commit is `buildCommit` — the short SHA stamped into the build at build
 * time (`svelte.config.js > kit.version.name`), the same value the logs and
 * /admin show. So after `npm run deploy`, `curl …/api/health` showing your
 * pushed SHA is the proof the box rebuilt + restarted on it.
 */
import os from 'node:os';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { buildCommit } from '$lib/server/version';
import { JOBS } from '$lib/server/scheduler';
import { sydneyHHMM } from '$lib/time';
import type { RequestHandler } from './$types';

const PROCESS_START = Date.now();

/** Cheap liveness probe against the sqlite file — catches a locked/corrupt DB
 *  that job history alone wouldn't surface. Synchronous (better-sqlite3). */
function dbOk(): boolean {
	try {
		db.run(sql`SELECT 1`);
		return true;
	} catch {
		return false;
	}
}

/** Compact duration: "3d 4h" / "2h 11m" / "6m" / "12s". */
function ago(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ${m % 60}m`;
	return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)}M`;
const gb = (bytes: number) => `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;

interface JobHealth {
	name: string;
	pattern: string;
	next: string | null;
	last: { status: 'ok' | 'error'; agoMs: number; durationMs: number; error?: string } | null;
}

function snapshot() {
	const mem = process.memoryUsage();
	const jobs: JobHealth[] = [...JOBS]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((j) => {
			const last = j.recent[0];
			return {
				name: j.name,
				pattern: j.pattern,
				next: j.cron.nextRun()?.toISOString() ?? null,
				last: last
					? {
							status: last.status,
							agoMs: Date.now() - last.at.getTime(),
							durationMs: last.durationMs,
							...(last.error ? { error: last.error } : {})
						}
					: null
			};
		});
	const database = dbOk();
	// `down` (DB unreachable) outranks `degraded` (a job errored) outranks `ok`.
	const status = !database
		? 'down'
		: jobs.some((j) => j.last?.status === 'error')
			? 'degraded'
			: 'ok';
	return {
		status,
		version: buildCommit,
		uptimeMs: Date.now() - PROCESS_START,
		node: process.version,
		env: env.KIOSK === 'true' ? 'kiosk' : 'dev',
		host: os.hostname(),
		db: database ? 'ok' : 'error',
		load: os.loadavg().map((n) => Number(n.toFixed(2))),
		cpus: os.cpus().length,
		rss: mem.rss,
		memUsed: os.totalmem() - os.freemem(),
		memTotal: os.totalmem(),
		jobs
	};
}

function asText(s: ReturnType<typeof snapshot>): string {
	const row = (label: string, value: string) => `  ${label.padEnd(9)} ${value}`;
	const lines = [
		`chota — health · ${s.status === 'ok' ? 'ok' : s.status.toUpperCase()}`,
		'',
		row('version', s.version),
		row('node', s.node),
		row('uptime', ago(s.uptimeMs)),
		row('env', s.env),
		row('host', s.host),
		row('db', s.db),
		row('load', s.load.join('  ')),
		row('memory', `rss ${mb(s.rss)} · sys ${gb(s.memUsed)} of ${gb(s.memTotal)}`),
		row('cpu', `${s.cpus} cores`),
		'',
		`  jobs (${s.jobs.length})`
	];
	for (const j of s.jobs) {
		const next = j.next ? sydneyHHMM(new Date(j.next)) : '—';
		const last = j.last
			? `${j.last.status === 'ok' ? 'ok ' : 'ERR'} · ${ago(j.last.agoMs)} ago`
			: '—';
		lines.push(
			`  ${j.name.padEnd(16)} ${j.pattern.padEnd(17)} next ${next.padEnd(7)} last ${last}`
		);
	}
	return lines.join('\n') + '\n';
}

export const GET: RequestHandler = async ({ url }) => {
	const snap = snapshot();
	if (url.searchParams.get('format') === 'json') {
		return json(snap);
	}
	return new Response(asText(snap), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
