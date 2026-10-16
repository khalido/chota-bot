/**
 * bus agent-tool — next live departures for the kids' configured trips.
 *
 * Wraps `$lib/server/tools/bus > getBus` over each unique trip in
 * `chota.config.ts > kids[].buses` (kids sharing a stop + routes are one
 * trip). Live TfNSW times from now; `realtime: false` means timetable only.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getConfig } from '$lib/server/config';
import { getBus } from '$lib/server/tools/bus';
import { errorMessage, logErr } from '$lib/server/log';
import { sydneyHHMM } from '$lib/time';

export const busTool = tool({
	description:
		'Next live bus departures (TfNSW) for the kids\' school-run trips. Use for "when\'s the next bus", "is the 501 late", "will Kid1 make the bus". Sydney local times; realtime=false means timetable only, not tracked.',
	inputSchema: z.object({}),
	execute: async () => {
		const trips = new Map<
			string,
			{ label: string; stop: string; routes: string[]; kids: string[] }
		>();
		for (const kid of getConfig().kids) {
			for (const t of kid.buses) {
				const key = `${t.stop}|${[...t.routes].sort().join(',')}`;
				const trip = trips.get(key) ?? { label: t.label, stop: t.stop, routes: t.routes, kids: [] };
				trip.kids.push(kid.name);
				trips.set(key, trip);
			}
		}
		if (trips.size === 0) return { trips: [], note: 'no bus trips configured' };
		return {
			trips: await Promise.all(
				[...trips.values()].map(async (t) => {
					try {
						const deps = await getBus({ stop: t.stop, routes: t.routes, limit: 4 });
						return {
							trip: t.label,
							kids: t.kids,
							departures: deps.map((d) => ({
								route: d.route,
								to: d.destination,
								departs: sydneyHHMM(d.estimatedAt),
								inMins: d.dueMins,
								realtime: d.realtime,
								cancelled: d.cancelled
							}))
						};
					} catch (err) {
						logErr('agent', `bus lookup failed for ${t.label}:`, err);
						return {
							trip: t.label,
							kids: t.kids,
							error: `bus times unavailable: ${errorMessage(err)}`
						};
					}
				})
			)
		};
	}
});
