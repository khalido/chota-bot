import { quoteForTime } from '$lib/server/quotes';
import { getWeather } from '$lib/server/tools/weather';
import { logErr } from '$lib/server/log';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const weather = await getWeather().catch((err) => {
		logErr('clock', 'weather lookup failed:', err);
		return null;
	});
	return { quote: quoteForTime(now), weather };
};
