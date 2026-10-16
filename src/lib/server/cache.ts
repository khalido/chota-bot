/**
 * The house TTL cache: wrap a plain fetch function once where it's exported,
 * and every caller gets a cached, de-duplicated version that says how old its
 * data is.
 *
 *   export const getThing = withTtl('thing', fetchThing, { ttl: 30 * 60_000 });
 *   const { value, asOf, stale } = await getThing(arg);
 *
 * Built on lru-cache's `fetch()`: concurrent calls for the same args share one
 * fetch, an expired entry refetches, and with `maxStale` a failed refetch
 * serves the last good value (`stale: true`) instead of throwing — until it is
 * older than `ttl + maxStale`. Serving a stale value is logged here; a hard
 * failure throws to the caller.
 */
import { LRUCache } from 'lru-cache';
import { logErr } from '$lib/server/log';

export interface Fresh<T> {
	value: T;
	/** When the value was fetched. */
	asOf: Date;
	/** True when a refetch failed and this is the last good value. */
	stale: boolean;
}

export interface TtlOptions {
	/** How long a value counts as fresh, in ms. */
	ttl: number;
	/** How much longer the last good value may be served when a refetch fails,
	 *  in ms. 0 (default) means a failed refetch throws. */
	maxStale?: number;
	/** Distinct argument sets to keep. */
	max?: number;
}

export interface Cached<A extends unknown[], T> {
	(...args: A): Promise<Fresh<T>>;
	/** Refetch now, ignoring the TTL — for refresh jobs. If the refetch fails
	 *  the last good value stays (within `maxStale`), unlike clearing first. */
	refresh(...args: A): Promise<Fresh<T>>;
}

interface Entry<T> {
	value: T;
	fetchedAt: number;
}

export function withTtl<A extends unknown[], T>(
	name: string,
	fn: (...args: A) => Promise<T>,
	{ ttl, maxStale = 0, max = 50 }: TtlOptions
): Cached<A, T> {
	const cache = new LRUCache<string, Entry<T>, unknown[]>({
		max,
		ttl,
		// Wall clock, not performance.now(): matches `fetchedAt`, and a box that
		// slept through the TTL treats its data as old (monotonic time doesn't
		// advance in sleep).
		perf: { now: () => Date.now() },
		ttlResolution: 0,
		// Implies noDeleteOnFetchRejection: the stale entry survives a failure.
		allowStaleOnFetchRejection: maxStale > 0,
		fetchMethod: async (_key, _stale, { context }) => ({
			value: await fn(...(context as A)),
			fetchedAt: Date.now()
		})
	});

	const read = async (args: A, forceRefresh: boolean): Promise<Fresh<T>> => {
		const status: LRUCache.Status<string, Entry<T>, unknown[]> = {};
		let entry: Entry<T> | undefined;
		try {
			entry = await cache.fetch(JSON.stringify(args), { context: args, status, forceRefresh });
		} catch (err) {
			// No stale value to fall back on — the caller decides how to log this.
			throw new Error(`${name} unavailable`, { cause: err });
		}
		if (status.fetchRejected) logErr('cache', `${name}: refetch failed`, status.fetchError);
		if (!entry) throw new Error(`${name} unavailable`, { cause: status.fetchError });
		if (Date.now() - entry.fetchedAt > ttl + maxStale) {
			throw new Error(`${name} unavailable: last good value is too old`, {
				cause: status.fetchError
			});
		}
		return {
			value: entry.value,
			asOf: new Date(entry.fetchedAt),
			stale: status.returnedStale === true
		};
	};
	const cached = (...args: A) => read(args, false);
	cached.refresh = (...args: A) => read(args, true);
	return cached;
}
