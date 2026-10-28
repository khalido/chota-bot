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
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { building } from '$app/environment';
import { clearAlert, raiseAlert } from '$lib/server/alerts';
import { db } from '$lib/server/db';
import { jobRun } from '$lib/server/db/schema';
import { errorMessage, event, logger } from '$lib/server/log';

const TIMEZONE = 'Australia/Sydney';
/** Default wall-clock cap per run. Clears the slowest jobs (morning-print
 *  screenshots each person; sentral-refresh may do a browser login). */
const TIMEOUT_MS = 10 * 60_000;
/** Run history kept in `job_run`. */
const KEEP_DAYS = 30;
/** A fire this late is stale: croner fires any overdue slot (it checks
 *  `now >= due` with no upper bound) — on wake from sleep, so a laptop shut
 *  for weeks printed a morning brief on open, and when a blocked slot is
 *  retried after a long-running previous run. Skip it; the next slot runs. */
const STALE_MS = 10 * 60_000;
const jobLog = logger('jobs');

export interface JobRecord {
	at: Date;
	status: 'ok' | 'error' | 'skipped';
	durationMs: number;
	summary?: string;
	error?: string;
}

export interface RegisteredJob {
	name: string;
	pattern: string;
	cron: Cron;
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

export interface JobOptions {
	/** Log ok runs (default true). False for frequent checks — a 30-min check
	 *  would add 48 identical lines a day; its failures and alerts still log,
	 *  and every run stays in /admin/jobs. */
	logOk?: boolean;
	/** Failed runs in a row before alerting (default 1). Frequent refreshes set
	 *  3 so one blip in a feed doesn't send "failed" then "working again". */
	alertAfter?: number;
	/** Wall-clock cap (default 10 min). A run past it fails and alerts, so a
	 *  hung print or browser call can't block every later tick. The work itself
	 *  isn't cancelled — it just stops holding the job. */
	timeoutMs?: number;
}

/**
 * Register a job. Call this once at the top of each `jobs/*.ts` file.
 * Same name → stop the previous Cron and replace (HMR + restart safety).
 *
 * `fn` may return a short summary string (e.g. "4 lists, 12 items"); it
 * gets appended to the success log line as `— <summary>`. A throw marks the
 * run failed and raises the `job:<name>` alert; the next ok run clears it.
 */
export function defineJob(
	name: string,
	pattern: string,
	fn: JobFn,
	{ logOk = true, alertAfter = 1, timeoutMs = TIMEOUT_MS }: JobOptions = {}
): Cron | undefined {
	if (building) return; // skip during `vite build`

	const existingIdx = JOBS.findIndex((j) => j.name === name);
	if (existingIdx >= 0) {
		JOBS[existingIdx].cron.stop();
		JOBS.splice(existingIdx, 1);
	}

	let due: Date | null = null;
	let failStreak = 0;
	// A run that timed out keeps going (JS can't stop it). Until it settles, the
	// next fire skips: croner's `protect` only covers the run it awaited, and
	// two morning prints racing for the printer is worse than one late skip.
	let straggler: Promise<unknown> | undefined;
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
			const lateMs = due ? start - due.getTime() : 0;
			due = cron.nextRun();
			if (lateMs > STALE_MS) {
				const error = `skipped stale fire, ${Math.round(lateMs / 60_000)} min late`;
				recordRun(name, { at, status: 'skipped', durationMs: 0, error });
				jobLog.warning('job {job} {error}', { job: name, error });
				return;
			}
			if (straggler) {
				const error = 'skipped: the previous run is still going after its timeout';
				recordRun(name, { at, status: 'skipped', durationMs: 0, error });
				jobLog.warning('job {job} {error}', { job: name, error });
				return;
			}
			// One wide `job.run` event per fire — see docs/logging.md. `runId` is
			// the `job_run` row.
			const ev = event('jobs', 'job {job} ran', { job: name });
			let error: string | undefined;
			try {
				const work = Promise.resolve().then(fn);
				const out = await withTimeout(work, timeoutMs, () => {
					straggler = work.catch(() => {}).finally(() => (straggler = undefined));
				});
				const summary = typeof out === 'string' && out.length > 0 ? out : undefined;
				const durationMs = Date.now() - start;
				ev.set('runId', recordRun(name, { at, status: 'ok', durationMs, summary }));
				if (logOk) ev.done({ summary });
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
				const durationMs = Date.now() - start;
				ev.set('runId', recordRun(name, { at, status: 'error', durationMs, error }));
				ev.fail(err);
			}
			// Outside the try: alerting never throws, and must not flip the run's status.
			failStreak = error ? failStreak + 1 : 0;
			if (error) {
				if (failStreak >= alertAfter) {
					const times = failStreak > 1 ? ` (${failStreak} runs in a row)` : '';
					await raiseAlert(`job:${name}`, `Job ${name} failed${times}: ${error}`);
				}
			} else await clearAlert(`job:${name}`, { recovered: `Job ${name} is working again` });
		}
	);

	due = cron.nextRun();
	JOBS.push({ name, pattern, cron });
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

/** Wait for `work`, failing if it takes longer than `ms` (`onTimeout` runs then). */
async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			onTimeout();
			reject(new Error(`timed out after ${Math.round(ms / 60_000)} min`));
		}, ms);
	});
	try {
		return await Promise.race([work, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

/** Store one fire. Never throws — recording a run must not fail it. */
function recordRun(job: string, r: JobRecord): number | undefined {
	try {
		return db
			.insert(jobRun)
			.values({ job, ...r })
			.returning({ id: jobRun.id })
			.get().id;
	} catch (err) {
		jobLog.error('recording {job} run failed: {error}', { job, error: errorMessage(err) });
	}
}

/** A job's latest runs, newest first (/admin/jobs, /api/health). */
export function recentRuns(job: string, limit = 20): JobRecord[] {
	try {
		return db
			.select()
			.from(jobRun)
			.where(eq(jobRun.job, job))
			.orderBy(desc(jobRun.at))
			.limit(limit)
			.all()
			.map(({ at, status, durationMs, summary, error }) => ({
				at,
				status,
				durationMs,
				summary: summary ?? undefined,
				error: error ?? undefined
			}));
	} catch (err) {
		jobLog.error('reading {job} runs failed: {error}', { job, error: errorMessage(err) });
		return [];
	}
}

/** How far back the missed-run check looks: a slot older than this is old
 *  news, and its alert (if any) stays open quietly until the next ok run. */
const MISSED_WINDOW_MS = 12 * 60 * 60_000;
/** A slot gets this long to show a run before it counts as missed. */
const MISSED_GRACE_MS = 30 * 60_000;

/**
 * Jobs whose last scheduled slot passed with no ok or error run recorded —
 * the box was off or restarting at that time, the run was cut off, or the fire
 * was skipped as stale. (A failed run has its own alert already.) Used by
 * `jobs/job-check.ts` for the prints.
 */
export function missedRuns(names: string[], now = new Date()): { name: string; slot: Date }[] {
	const missed: { name: string; slot: Date }[] = [];
	for (const name of names) {
		const job = JOBS.find((j) => j.name === name);
		if (!job || job.cron.isBusy()) continue;
		const slot = job.cron.previousRuns(1, now)[0];
		const age = slot ? now.getTime() - slot.getTime() : Infinity;
		if (age < MISSED_GRACE_MS || age > MISSED_WINDOW_MS) continue;
		const ran = db
			.select({ id: jobRun.id })
			.from(jobRun)
			.where(
				and(eq(jobRun.job, name), gte(jobRun.at, slot), inArray(jobRun.status, ['ok', 'error']))
			)
			.get();
		if (!ran) missed.push({ name, slot });
	}
	return missed;
}

/** Drop runs older than KEEP_DAYS. Returns how many went. */
export function pruneRuns(now = new Date()): number {
	const cutoff = new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60_000);
	return db.delete(jobRun).where(lt(jobRun.at, cutoff)).run().changes;
}
