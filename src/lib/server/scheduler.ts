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
import { log, logErr } from '$lib/server/log';

const TIMEZONE = 'Australia/Sydney';
const RING_SIZE = 20;

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
	// eslint-disable-next-line no-var
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
				log('jobs', `${name} blocked — previous still running since ${c.currentRun()?.toISOString()}`),
			catch: (err) => logErr('jobs', `${name} caught:`, err)
		},
		async () => {
			const at = new Date();
			const start = Date.now();
			try {
				const summary = await fn();
				const durationMs = Date.now() - start;
				push(recent, { at, status: 'ok', durationMs });
				const tail = typeof summary === 'string' && summary.length > 0 ? ` — ${summary}` : '';
				log('jobs', `${name} ok in ${durationMs}ms${tail}`);
			} catch (err) {
				const durationMs = Date.now() - start;
				const error = err instanceof Error ? err.message : String(err);
				push(recent, { at, status: 'error', durationMs, error });
				logErr('jobs', `${name} failed in ${durationMs}ms: ${error}`);
			}
		}
	);

	JOBS.push({ name, pattern, cron, recent });
	log('jobs', `registered ${name} "${pattern}", next at ${cron.nextRun()?.toISOString() ?? '?'}`);
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
			log('jobs', `boot — ${JOBS.length} job(s) registered`);
		} finally {
			bootInFlight = null;
		}
	})();
	return bootInFlight;
}

function push(buf: JobRecord[], r: JobRecord) {
	buf.unshift(r);
	if (buf.length > RING_SIZE) buf.length = RING_SIZE;
}
