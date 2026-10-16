import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTtl } from './cache';

vi.mock('$lib/server/log', () => ({ logErr: vi.fn() }));

afterEach(() => vi.useRealTimers());

describe('withTtl', () => {
	it('fetches once, then serves from cache until the ttl passes', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:00+11:00') });
		const fn = vi.fn(async (x: number) => x * 2);
		const get = withTtl('double', fn, { ttl: 60_000 });

		const first = await get(2);
		expect(first).toMatchObject({ value: 4, stale: false });
		expect(first.asOf.toISOString()).toBe('2026-10-15T22:00:00.000Z');
		await get(2);
		expect(fn).toHaveBeenCalledTimes(1);

		vi.setSystemTime(Date.now() + 61_000);
		await get(2);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('keys by arguments and shares one fetch between concurrent calls', async () => {
		const fn = vi.fn(async (x: number) => x);
		const get = withTtl('id', fn, { ttl: 60_000 });
		await Promise.all([get(1), get(1), get(2)]);
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('serves the last good value as stale when a refetch fails within maxStale', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:00+11:00') });
		let fail = false;
		const get = withTtl(
			'flaky',
			async () => {
				if (fail) throw new Error('feed down');
				return 'good';
			},
			{ ttl: 60_000, maxStale: 10 * 60_000 }
		);
		await get();

		fail = true;
		vi.setSystemTime(Date.now() + 2 * 60_000);
		const r = await get();
		expect(r).toMatchObject({ value: 'good', stale: true });
		expect(r.asOf.toISOString()).toBe('2026-10-15T22:00:00.000Z');
	});

	it('throws once the last good value is older than ttl + maxStale', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:00+11:00') });
		let fail = false;
		const get = withTtl(
			'flaky',
			async () => {
				if (fail) throw new Error('feed down');
				return 'good';
			},
			{ ttl: 60_000, maxStale: 10 * 60_000 }
		);
		await get();

		fail = true;
		vi.setSystemTime(Date.now() + 12 * 60_000);
		await expect(get()).rejects.toThrow('flaky unavailable');
	});

	it('throws on failure when maxStale is 0', async () => {
		const get = withTtl(
			'strict',
			async () => {
				throw new Error('nope');
			},
			{ ttl: 60_000 }
		);
		await expect(get()).rejects.toThrow('strict unavailable');
	});

	it('refresh() refetches now, and keeps the last good value if that fails', async () => {
		let n = 0;
		let fail = false;
		const get = withTtl(
			'counter',
			async () => {
				if (fail) throw new Error('down');
				return ++n;
			},
			{ ttl: 60_000, maxStale: 60 * 60_000 }
		);
		expect((await get()).value).toBe(1);
		expect((await get.refresh()).value).toBe(2);
		fail = true;
		expect(await get.refresh()).toMatchObject({ value: 2, stale: true });
		expect((await get()).value).toBe(2);
	});
});
