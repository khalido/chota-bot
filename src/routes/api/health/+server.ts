/**
 * GET /api/health — a plain-text status dump for `curl` / SSH.
 *
 *   curl -s sp5.local:8000/api/health
 *
 * App version + uptime, system load/memory, and every job's next run and last
 * outcome. No auth: it carries no secrets, and a health check you can't reach
 * is useless. `?format=json` returns the same data as JSON for tooling.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { JOBS } from '$lib/server/scheduler';
import { sydneyHHMM } from '$lib/time';
import type { RequestHandler } from './$types';

const exec = promisify(execFile);
const PROCESS_START = Date.now();

/** Short git SHA of the running build — read once, then cached for the process. */
let cachedSha: string | null = null;
async function gitSha(): Promise<string> {
	if (cachedSha !== null) return cachedSha;
	try {
		const { stdout } = await exec('git', ['rev-parse', '--short', 'HEAD'], { timeout: 2000 });
		cachedSha = stdout.trim() || 'unknown';
	} catch {
		cachedSha = 'unknown';
	}
	return cachedSha;
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
	return {
		status: jobs.some((j) => j.last?.status === 'error') ? 'degraded' : 'ok',
		uptimeMs: Date.now() - PROCESS_START,
		node: process.version,
		env: env.KIOSK === 'true' ? 'kiosk' : 'dev',
		host: os.hostname(),
		load: os.loadavg().map((n) => Number(n.toFixed(2))),
		cpus: os.cpus().length,
		rss: mem.rss,
		memUsed: os.totalmem() - os.freemem(),
		memTotal: os.totalmem(),
		jobs
	};
}

function asText(sha: string, s: ReturnType<typeof snapshot>): string {
	const row = (label: string, value: string) => `  ${label.padEnd(9)} ${value}`;
	const lines = [
		`chota — health · ${s.status === 'degraded' ? 'DEGRADED' : 'ok'}`,
		'',
		row('version', sha),
		row('node', s.node),
		row('uptime', ago(s.uptimeMs)),
		row('env', s.env),
		row('host', s.host),
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
	const sha = await gitSha();
	const snap = snapshot();
	if (url.searchParams.get('format') === 'json') {
		return json({ version: sha, ...snap });
	}
	return new Response(asText(sha, snap), {
		headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
	});
};
