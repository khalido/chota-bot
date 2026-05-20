/**
 * Scheduler — wraps croner with our defaults + a lazy job registry.
 *
 * Job files live in `./jobs/*.ts`. They self-register via `defineJob()` at
 * module top-level. Nothing happens until `bootJobs()` is called (from
 * hooks.server.ts), so importing `JOBS` in tests, scripts, prerender, or
 * /admin doesn't accidentally start the scheduler.
 *
 * See `src/lib/server/jobs/CLAUDE.md` for how to write a job.
 */
import { Cron } from 'croner';
import { building } from '$app/environment';
import { event, logger } from '$lib/server/log';

const TIMEZONE = 'Australia/Sydney';
const RING_SIZE = 20;
const jobLog = logger('jobs');

export interface JobRecord {
	at: Date;
	status: 'ok' | 'error';
	durationMs: number;
	error?: string;
}

export interface RegisteredJob {
	name: string;
	pattern: string;
	cron: Cron;
	recent: JobRecord[];
}

// HMR-safe registry: shared via globalThis so a hot-reload of this module
// can find and stop the previous Cron instances before re-registering.
declare global {
	var __chotaJobs: RegisteredJob[] | undefined;
}
if (!globalThis.__chotaJobs) globalThis.__chotaJobs = [];
export const JOBS: RegisteredJob[] = globalThis.__chotaJobs;

/** Optional return value from a job — appended to the "ok" log line. */
export type JobFn = () => Promise<string | void> | string | void;

/**
 * Register a job. Call this once at the top of each `jobs/*.ts` file.
 * Same name → stop the previous Cron and replace (HMR + restart safety).
 *
 * `fn` may return a short summary string (e.g. "4 lists, 12 items"); it
 * gets appended to the success log line as `— <summary>`.
 */
export function defineJob(name: string, pattern: string, fn: JobFn): Cron | undefined {
	if (building) return; // skip during `vite build`

	const existingIdx = JOBS.findIndex((j) => j.name === name);
	if (existingIdx >= 0) {
		JOBS[existingIdx].cron.stop();
		JOBS.splice(existingIdx, 1);
	}

	const recent: JobRecord[] = [];
	const cron = new Cron(
		pattern,
		{
			name,
			timezone: TIMEZONE,
			protect: (c) =>
				jobLog.warning('job {job} blocked — previous still running since {since}', {
					job: name,
					since: c.currentRun()?.toISOString()
				}),
			catch: (err) =>
				jobLog.error('job {job} caught error', {
					job: name,
					error: err instanceof Error ? err.message : String(err)
				})
		},
		async () => {
			const at = new Date();
			const start = Date.now();
			// One wide `job.run` event per fire — see docs/logging.md. `runId`
			// joins here once the job_runs table lands (docs/jobs.md).
			const ev = event('jobs', 'job {job} ran', { job: name });
			try {
				const summary = await fn();
				push(recent, { at, status: 'ok', durationMs: Date.now() - start });
				ev.done({
					summary: typeof summary === 'string' && summary.length > 0 ? summary : undefined
				});
			} catch (err) {
				const error = err instanceof Error ? err.message : String(err);
				push(recent, { at, status: 'error', durationMs: Date.now() - start, error });
				ev.fail(err);
			}
		}
	);

	JOBS.push({ name, pattern, cron, recent });
	jobLog.info('registered {job}: {pattern}, next at {next}', {
		job: name,
		pattern,
		next: cron.nextRun()?.toISOString() ?? '?'
	});
	return cron;
}

/**
 * Discover and register every `jobs/*.ts` file. Safe to call many times:
 * - Concurrent calls share the in-flight Promise (no duplicate registration races).
 * - Sequential calls re-run, so newly-added job files get picked up. Already-
 *   loaded modules return their cached export instantly, and `defineJob`
 *   replaces by name — no leaks.
 *
 * Lazy glob (no `eager`) ensures importing this module for `JOBS` alone
 * does NOT trigger registration. Job files only execute when this runs.
 *
 * NB: the in-flight promise is module-scoped, NOT on globalThis — that way
 * an HMR reload of this module clears it, letting the next call rediscover
 * with the freshly-globbed file list.
 */
let bootInFlight: Promise<void> | null = null;
export function bootJobs(): Promise<void> {
	if (bootInFlight) return bootInFlight;
	bootInFlight = (async () => {
		try {
			const modules = import.meta.glob('./jobs/*.ts');
			await Promise.all(Object.values(modules).map((load) => load()));
			jobLog.info('boot — {count} job(s) registered', { count: JOBS.length });
		} finally {
			bootInFlight = null;
		}
	})();
	return bootInFlight;
}

/**
 * Stop every registered job's Cron timer. Wire this to SIGTERM/SIGINT (see
 * hooks.server.ts) — croner's timers otherwise keep Node's event loop alive
 * after adapter-node has closed the HTTP server, so the process never exits on
 * its own and systemd SIGKILLs it once the stop timeout elapses.
 */
export function stopJobs(): void {
	for (const j of JOBS) j.cron.stop();
	jobLog.info('jobs stopped — {count} job(s)', { count: JOBS.length });
}

function push(buf: JobRecord[], r: JobRecord) {
	buf.unshift(r);
	if (buf.length > RING_SIZE) buf.length = RING_SIZE;
}
