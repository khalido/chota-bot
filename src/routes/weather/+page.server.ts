import { error } from '@sveltejs/kit';
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
	const weather = await getWeather().catch((err) => {
		logErr('weather', 'lookup failed:', err);
		return null;
	});
	if (!weather) {
		throw error(503, 'Weather unavailable');
	}

	const blocks = groupByDayBlocks(weather.hourly);
	const days = groupByDay(blocks).map((d) => ({
		...d,
		pastBlocks: pastBlocksFor(d.dateKey, now) as BlockName[]
	}));
	const thresholds = getConfig().home?.weather;
	const headline = weatherSummary(weather, thresholds, now);
	const tomorrow = tomorrowSummary(weather, thresholds, now);
	const home = getConfig().home;

	return {
		weather,
		days,
		headline,
		tomorrow,
		suburb: home?.suburb ?? 'Home'
	};
};
