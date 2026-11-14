/**
 * Data for the TV page. Same tools and fallbacks as the dashboard loader
 * (routes/+page.server.ts): cached reads warmed by the *-refresh jobs, so the
 * page's once-a-minute reload is cheap. Shaping only; the numbers come from
 * the tools.
 */
import { collectTripReports } from '#lib/server/print/brief.ts';
import { getWeather, weatherSummary } from '#lib/server/tools/weather.ts';
import { getCalendar, type CalendarEvent } from '#lib/server/tools/calendar.ts';
import { getConfig } from '#lib/server/config.ts';
import { logErr } from '#lib/server/log.ts';
import { houseNow } from '#lib/server/home.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();
	const config = getConfig();

	const [trips, weather, rawEvents] = await Promise.all([
		collectTripReports(now),
		getWeather().catch((err) => {
			logErr('tv', 'weather lookup failed:', err);
			return null;
		}),
		getCalendar({ range: 'week' }).catch((err) => {
			logErr('tv', 'calendar lookup failed:', err);
			return [] as CalendarEvent[];
		})
	]);

	return {
		trips,
		weather,
		headline: weather ? weatherSummary(weather, config.home?.weather, now) : null,
		// The whole week, uncapped: Today takes today's from it, Calendar shows it all.
		events: rawEvents,
		// The house in a paragraph and the windows, from the same home the chat
		// tools read (#lib/server/home.ts). Null when the home isn't set up.
		home: houseNow()
	};
};
