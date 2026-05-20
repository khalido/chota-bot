import { collectTripReports } from '$lib/server/print/brief';
import { getRecipients } from '$lib/server/print/sections';
import { quoteForTime } from '$lib/server/quotes';
import { getChores } from '$lib/server/chores';
import { getWeather, weatherSummary } from '$lib/server/tools/weather';
import { getCalendar, type CalendarEvent } from '$lib/server/tools/calendar';
import { getFamilyLists, type ProjectWithTasks } from '$lib/server/tools/ticktick';
import { parseEventPeople } from '$lib/server/people';
import { getConfig } from '$lib/server/config';
import { logErr } from '$lib/server/log';
import type { PageServerLoad } from './$types';

const CALENDAR_LIMIT = 8;

export const load: PageServerLoad = async () => {
	const now = new Date();
	const config = getConfig();

	const [trips, weather, rawEvents, lists] = await Promise.all([
		collectTripReports(now),
		getWeather().catch((err) => {
			logErr('dashboard', 'weather lookup failed:', err);
			return null;
		}),
		getCalendar({ range: 'week' }).catch((err) => {
			logErr('dashboard', 'calendar lookup failed:', err);
			return [] as CalendarEvent[];
		}),
		getFamilyLists().catch((err) => {
			logErr('dashboard', 'ticktick lookup failed:', err);
			return [] as ProjectWithTasks[];
		})
	]);

	const events = rawEvents.slice(0, CALENDAR_LIMIT).map((e) => ({
		...e,
		people: parseEventPeople(e.summary, config.family ?? [])
	}));

	const quote = quoteForTime(now);
	const chores = getChores({ now });
	const headline = weather ? weatherSummary(weather, config.home?.weather, now) : null;

	return { trips, quote, chores, weather, headline, events, lists, recipients: getRecipients() };
};
