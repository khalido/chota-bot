import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineJob, JOBS } from './scheduler';
import { clearAlert, raiseAlert } from '$lib/server/alerts';

vi.mock('$lib/server/alerts', () => ({ raiseAlert: vi.fn(), clearAlert: vi.fn() }));

afterEach(() => {
	for (const j of JOBS.splice(0)) j.cron.stop();
	vi.useRealTimers();
});

describe('defineJob stale-fire guard', () => {
	it('skips a fire the box slept through, then runs the next one on time', async () => {
		vi.useFakeTimers({ now: new Date('2026-09-24T06:00:00+10:00') });
		const fn = vi.fn();
		defineJob('test-print', '45 6 * * *', fn);
		const job = JOBS.find((j) => j.name === 'test-print')!;

		// Lid shut for 20 days: the wall clock jumps, timers don't advance.
		vi.setSystemTime(new Date('2026-10-14T09:00:00+11:00'));
		await vi.advanceTimersByTimeAsync(30_000);
		expect(fn).not.toHaveBeenCalled();
		expect(job.recent[0].status).toBe('skipped');

		// Next morning fires normally.
		vi.setSystemTime(new Date('2026-10-15T06:44:50+11:00'));
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(job.recent[0].status).toBe('ok');
	});
});

describe('defineJob protect + stale guard', () => {
	it('drops a blocked slot retried long after, then runs the next slot', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-15T09:00:00+11:00') });
		let release!: () => void;
		let calls = 0;
		defineJob('test-slow', '*/15 * * * *', () => {
			calls++;
			if (calls === 1) return new Promise<void>((r) => (release = r));
		});
		const job = JOBS.find((j) => j.name === 'test-slow')!;

		await vi.advanceTimersByTimeAsync(15 * 60_000); // 09:15 — first run hangs
		await vi.advanceTimersByTimeAsync(27 * 60_000); // 09:42 — the 09:30 slot stayed blocked
		release(); // croner now retries 09:30, ~12 min late
		await vi.advanceTimersByTimeAsync(60_000);
		expect(job.recent[0].status).toBe('skipped');

		await vi.advanceTimersByTimeAsync(3 * 60_000); // 09:46 — past the 09:45 slot
		expect(calls).toBe(2);
		expect(job.recent[0].status).toBe('ok');
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
