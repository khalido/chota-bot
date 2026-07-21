import {
	getWeather,
	groupByDay,
	groupByDayBlocks,
	pastBlocksFor,
	tomorrowSummary,
	weatherSummary,
	type BlockName
} from '$lib/server/tools/weather';
import { getConfig } from '$lib/server/config';
import { logErr } from '$lib/server/log';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const suburb = getConfig().home?.suburb ?? 'Home';
	const weather = await getWeather().catch((err) => {
		logErr('weather', 'lookup failed:', err);
		return null;
	});
	// Degrade, don't crash: a cold/failed weather cache used to `throw error(503)`,
	// which drops the fullscreen kiosk onto the unstyled default error page. The
	// page renders an "unavailable" state from `weather: null` instead.
	if (!weather) {
		return { weather: null, days: [], headline: null, tomorrow: null, suburb };
	}

	const blocks = groupByDayBlocks(weather.hourly);
	const days = groupByDay(blocks).map((d) => ({
		...d,
		pastBlocks: pastBlocksFor(d.dateKey, now) as BlockName[]
	}));
	const thresholds = getConfig().home?.weather;
	const headline = weatherSummary(weather, thresholds, now);
	const tomorrow = tomorrowSummary(weather, thresholds, now);

	return { weather, days, headline, tomorrow, suburb };
};
