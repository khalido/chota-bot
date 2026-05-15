import { TRANSPORT_NSW_API_KEY } from '$env/static/private';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';
import { sydneyTimeCompact, sydneyTimeOnDay } from '$lib/time';

const ENDPOINT = 'https://api.transport.nsw.gov.au/v1/tp/departure_mon';
const FETCH_LIMIT = 30; // always fetch this many; slice in getBus per caller's limit

export interface BusDeparture {
	/** Route number, e.g. "501". */
	route: string;
	/** Destination headsign, e.g. "Sydney Central". */
	destination: string;
	/** Minutes from now to estimated departure (rounded). */
	dueMins: number;
	/** True if the time is live-tracked, false if scheduled-only. */
	realtime: boolean;
	/** True if TfNSW flagged the service/stop as cancelled (`realtimeStatus`). */
	cancelled: boolean;
	scheduledAt: Date;
	estimatedAt: Date;
}

export interface GetBusOptions {
	/** TfNSW stop ID (numeric string). */
	stop: string;
	/** Filter to these route numbers; undefined or empty = all routes. */
	routes?: string[];
	/** Max departures to return (default 5). */
	limit?: number;
}

// Cache by stop+routes (sorted). Stores up to FETCH_LIMIT departures; getBus
// slices to caller's `limit`. Filter by `dueMins >= 0` happens at fetch time
// — we re-filter on read to drop departures that have since passed.
const cache = new Map<string, BusDeparture[]>();

function cacheKey(stop: string, routes?: string[]): string {
	const r = routes && routes.length > 0 ? [...routes].sort().join(',') : '';
	return `${stop}|${r}`;
}

/** Read departures. Returns cache if hot, delegates to refresh on cold.
 *  Cached entries are re-filtered by `dueMins >= 0` so passed buses drop. */
export async function getBus({ stop, routes, limit = 5 }: GetBusOptions): Promise<BusDeparture[]> {
	const key = cacheKey(stop, routes);
	const cached = cache.get(key);
	if (cached) return reFilter(cached, limit);
	const fresh = await refreshBus({ stop, routes });
	return fresh.slice(0, limit);
}

/** Always fetch + replace cache. Called by the bus-refresh job + as the
 *  cold-start path of getBus. */
export async function refreshBus({
	stop,
	routes
}: {
	stop: string;
	routes?: string[];
}): Promise<BusDeparture[]> {
	if (!TRANSPORT_NSW_API_KEY) {
		throw new Error('Set TRANSPORT_NSW_API_KEY in .env');
	}

	const params = new URLSearchParams({
		outputFormat: 'rapidJSON',
		coordOutputFormat: 'EPSG:4326',
		mode: 'direct',
		type_dm: 'stop',
		name_dm: stop,
		departureMonitorMacro: 'true',
		TfNSWDM: 'true'
	});

	const res = await fetch(`${ENDPOINT}?${params}`, {
		headers: { Authorization: `apikey ${TRANSPORT_NSW_API_KEY}` },
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		logErr('bus', `TfNSW ${res.status}: ${body.slice(0, 100)}`);
		throw new Error(`TfNSW departure_mon ${res.status}: ${body}`);
	}

	const data = (await res.json()) as TfNswResponse;
	const now = Date.now();
	const wanted = routes && routes.length > 0 ? new Set(routes) : null;

	const result = (data.stopEvents ?? [])
		.map((e) => mapEvent(e, now))
		.filter((d) => d.dueMins >= 0)
		.filter((d) => !wanted || wanted.has(d.route))
		.slice(0, FETCH_LIMIT);

	cache.set(cacheKey(stop, routes), result);
	log('bus', `${result.length} departures for stop ${stop}${wanted ? ` filtered to [${[...wanted].join(',')}]` : ''}`);
	return result;
}

/** Refresh every stop in chota.config.ts > kids[].buses. Returns count. */
export async function refreshAllConfiguredBus(): Promise<number> {
	const seen = new Set<string>();
	const trips: { stop: string; routes: string[] }[] = [];
	for (const kid of getConfig().kids) {
		for (const trip of kid.buses) {
			const k = cacheKey(trip.stop, trip.routes);
			if (seen.has(k)) continue;
			seen.add(k);
			trips.push({ stop: trip.stop, routes: trip.routes });
		}
	}
	await Promise.all(trips.map((t) => refreshBus(t)));
	return trips.length;
}

function reFilter(deps: BusDeparture[], limit: number): BusDeparture[] {
	const now = Date.now();
	return deps
		.map((d) => ({ ...d, dueMins: Math.round((d.estimatedAt.getTime() - now) / 60_000) }))
		.filter((d) => d.dueMins >= 0)
		.slice(0, limit);
}

function mapEvent(e: TfNswStopEvent, now: number): BusDeparture {
	const planned = new Date(e.departureTimePlanned);
	const estimated = e.departureTimeEstimated ? new Date(e.departureTimeEstimated) : planned;
	return {
		route: e.transportation?.disassembledName ?? '?',
		destination: e.transportation?.destination?.name ?? '?',
		dueMins: Math.round((estimated.getTime() - now) / 60_000),
		realtime: Boolean(e.isRealtimeControlled),
		cancelled: Boolean(e.realtimeStatus?.some((s) => /cancel/i.test(s))),
		scheduledAt: planned,
		estimatedAt: estimated
	};
}

/**
 * One line for the print: the next few departures around `targetTime` (the
 * school run — 25 min before to 30 min after), grouped by route,
 * cancellations flagged. Falls back to "next few from now" if nothing's in the
 * window (e.g. viewed in the afternoon). null when there are no departures at
 * all. Lives here so the windowing/formatting stays next to the bus knowledge
 * and `getBus` itself stays generic.
 *
 *   "501 at 7:42am, 7:52am, 8:03am (cancelled), 8:14am"
 */
export async function schoolRunLine(
	opts: { stop: string; routes: string[]; targetTime: string },
	now: Date = new Date()
): Promise<string | null> {
	const all = await getBus({ stop: opts.stop, routes: opts.routes, limit: FETCH_LIMIT });
	const target = sydneyTimeOnDay(opts.targetTime, now).getTime();
	const inWindow = all.filter(
		(d) => d.estimatedAt.getTime() >= target - 25 * 60_000 && d.estimatedAt.getTime() <= target + 30 * 60_000
	);
	// Fallback: if the school-run window is empty (e.g. the brief is being
	// previewed mid-afternoon), show the next few from now — never include
	// departures that have already left.
	const future = all.filter((d) => d.estimatedAt.getTime() >= now.getTime());
	const picks = (inWindow.length ? inWindow : future).slice(0, 4);
	if (picks.length === 0) return null;

	const byRoute = new Map<string, BusDeparture[]>();
	for (const d of picks) byRoute.set(d.route, [...(byRoute.get(d.route) ?? []), d]);
	return [...byRoute.entries()]
		.map(
			([route, ds]) =>
				`${route} at ${ds.map((d) => sydneyTimeCompact(d.estimatedAt) + (d.cancelled ? ' (cancelled)' : '')).join(', ')}`
		)
		.join('; ');
}

interface TfNswResponse {
	stopEvents?: TfNswStopEvent[];
}

interface TfNswStopEvent {
	departureTimePlanned: string;
	departureTimeEstimated?: string;
	isRealtimeControlled?: boolean;
	/** e.g. ["MONITORED"], ["PROVISIONAL"], or a cancellation marker like ["TRIP_CANCELLED"]. */
	realtimeStatus?: string[];
	transportation?: {
		disassembledName?: string;
		destination?: { name?: string };
	};
}
