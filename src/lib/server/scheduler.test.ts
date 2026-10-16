import { afterEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';
import { clearAlert, raiseAlert } from '$lib/server/alerts';

const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE job_run (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL, job text NOT NULL, at integer NOT NULL,
	status text NOT NULL, duration_ms integer NOT NULL, summary text, error text)`);
vi.mock('$lib/server/db', () => ({ db: drizzle(sqlite, { schema }) }));
vi.mock('$lib/server/alerts', () => ({ raiseAlert: vi.fn(), clearAlert: vi.fn() }));

const { defineJob, JOBS, missedRuns, pruneRuns, recentRuns } = await import('./scheduler');

afterEach(() => {
	for (const j of JOBS.splice(0)) j.cron.stop();
	sqlite.exec('DELETE FROM job_run');
	vi.useRealTimers();
});

const addRun = (job: string, at: string, status: 'ok' | 'error' | 'skipped') =>
	sqlite
		.prepare('INSERT INTO job_run (job, at, status, duration_ms) VALUES (?, ?, ?, 0)')
		.run(job, new Date(at).getTime(), status);

describe('defineJob stale-fire guard', () => {
	it('skips a fire the box slept through, then runs the next one on time', async () => {
		vi.useFakeTimers({ now: new Date('2026-09-24T06:00:00+10:00') });
		const fn = vi.fn();
		defineJob('test-print', '45 6 * * *', fn);

		// Lid shut for 20 days: the wall clock jumps, timers don't advance.
		vi.setSystemTime(new Date('2026-10-14T09:00:00+11:00'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fn).not.toHaveBeenCalled();
		expect(recentRuns('test-print')[0].status).toBe('skipped');

		// Next morning fires normally.
		vi.setSystemTime(new Date('2026-10-15T06:44:50+11:00'));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(recentRuns('test-print')[0].status).toBe('ok');
	});
});

describe('defineJob protect + stale guard', () => {
	it('drops a blocked slot retried long after, then runs the next slot', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-15T09:00:00+11:00') });
		let release!: () => void;
		let calls = 0;
		defineJob(
			'test-slow',
			'*/15 * * * *',
			() => {
				calls++;
				if (calls === 1) return new Promise<void>((r) => (release = r));
			},
			{ timeoutMs: 60 * 60_000 } // outlast the hang, to test the retried slot
		);

		await vi.advanceTimersByTimeAsync(15 * 60_000); // 09:15 — first run hangs
		await vi.advanceTimersByTimeAsync(27 * 60_000); // 09:42 — the 09:30 slot stayed blocked
		release(); // croner now retries 09:30, ~12 min late
		await vi.advanceTimersByTimeAsync(60_000);
		expect(recentRuns('test-slow')[0].status).toBe('skipped');

		await vi.advanceTimersByTimeAsync(3 * 60_000); // 09:46 — past the 09:45 slot
		expect(calls).toBe(2);
		expect(recentRuns('test-slow')[0].status).toBe('ok');
	});
});

describe('defineJob alerts', () => {
	it('alerts after alertAfter failures in a row, and clears on the next ok run', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:30+11:00') });
		vi.mocked(raiseAlert).mockClear();
		vi.mocked(clearAlert).mockClear();
		let fail = true;
		defineJob(
			'test-feed',
			'* * * * *',
			() => {
				if (fail) throw new Error('feed down');
			},
			{ alertAfter: 2 }
		);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(raiseAlert).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(raiseAlert).toHaveBeenCalledWith(
			'job:test-feed',
			'Job test-feed failed (2 runs in a row): feed down'
		);
		fail = false;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(clearAlert).toHaveBeenLastCalledWith('job:test-feed', expect.anything());
	});
});

describe('defineJob timeout', () => {
	it('fails a hung run and alerts, then the next tick runs', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:30+11:00') });
		vi.mocked(raiseAlert).mockClear();
		let calls = 0;
		defineJob(
			'test-hang',
			'*/5 * * * *',
			() => {
				calls++;
				if (calls === 1) return new Promise<void>(() => {}); // never settles
			},
			{ timeoutMs: 2 * 60_000 }
		);
		await vi.advanceTimersByTimeAsync(5 * 60_000); // 09:05 fires and hangs
		await vi.advanceTimersByTimeAsync(2 * 60_000); // 09:07 times out
		expect(recentRuns('test-hang')[0]).toMatchObject({
			status: 'error',
			error: 'timed out after 2 min'
		});
		expect(raiseAlert).toHaveBeenCalledWith(
			'job:test-hang',
			'Job test-hang failed: timed out after 2 min'
		);
		await vi.advanceTimersByTimeAsync(3 * 60_000); // 09:10
		expect(calls).toBe(2);
		expect(recentRuns('test-hang')[0].status).toBe('ok');
	});
});

describe('missedRuns', () => {
	const at = (iso: string) => new Date(iso);
	const define = () => {
		vi.useFakeTimers({ now: at('2026-10-15T06:00:00+11:00') });
		defineJob('test-print', '45 6 * * 1-5', () => {});
	};

	it('flags a slot with no run once the grace period is up', () => {
		define();
		expect(missedRuns(['test-print'], at('2026-10-15T07:00:00+11:00'))).toEqual([]);
		expect(missedRuns(['test-print'], at('2026-10-15T07:30:00+11:00'))).toEqual([
			{ name: 'test-print', slot: at('2026-10-15T06:45:00+11:00') }
		]);
	});

	it('counts ok and error runs, not a skipped stale fire', () => {
		define();
		const now = at('2026-10-15T07:30:00+11:00');
		addRun('test-print', '2026-10-15T06:45:01+11:00', 'skipped');
		expect(missedRuns(['test-print'], now)).toHaveLength(1);
		addRun('test-print', '2026-10-15T06:45:02+11:00', 'error');
		expect(missedRuns(['test-print'], now)).toEqual([]);
	});

	it("ignores yesterday's run and slots older than 12h", () => {
		define();
		addRun('test-print', '2026-10-14T06:45:00+11:00', 'ok');
		expect(missedRuns(['test-print'], at('2026-10-15T08:00:00+11:00'))).toHaveLength(1);
		expect(missedRuns(['test-print'], at('2026-10-15T20:00:00+11:00'))).toEqual([]);
	});
});

describe('pruneRuns', () => {
	it('drops runs older than 30 days', () => {
		addRun('test-feed', '2026-09-01T09:00:00+10:00', 'ok');
		addRun('test-feed', '2026-10-10T09:00:00+11:00', 'ok');
		expect(pruneRuns(new Date('2026-10-16T09:00:00+11:00'))).toBe(1);
		expect(recentRuns('test-feed')).toHaveLength(1);
	});
});
