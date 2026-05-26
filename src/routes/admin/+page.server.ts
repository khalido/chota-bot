import { collectTripReports } from '$lib/server/print/brief';
import { getRecipients } from '$lib/server/print/sections';
import { quoteForTime } from '$lib/server/tools/clock-quotes';
import { getConfig } from '$lib/server/config';
import { getChores } from '$lib/server/chores';
import { getWeather } from '$lib/server/tools/weather';
import { getCalendar, getCalendarList } from '$lib/server/tools/calendar';
import {
	listProjects,
	listConfiguredVsActual,
	getProjectWithTasks
} from '$lib/server/tools/ticktick';
import { getDeployStatus } from '$lib/server/version';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const now = new Date();

	const [trips, weather, calendar, calendarList, ticktickAll, ticktickMapping, deploy] =
		await Promise.all([
			collectTripReports(now).catch((e) => ({ error: String(e) })),
			getWeather().catch((e) => ({ error: String(e) })),
			getCalendar({ range: 'week' }).catch((e) => ({ error: String(e) })),
			getCalendarList().catch((e) => ({ error: String(e) })),
			listProjects().catch((e) => ({ error: String(e) })),
			listConfiguredVsActual().catch((e) => ({ error: String(e) })),
			getDeployStatus()
		]);

	const ticktickLists = Array.isArray(ticktickMapping)
		? await Promise.all(
				ticktickMapping.map(async (m) => {
					if (!m.project) return { ...m, tasks: [] as unknown[] };
					const data = await getProjectWithTasks(m.project.id).catch((e) => ({
						tasks: [],
						error: String(e)
					}));
					return { ...m, ...data };
				})
			)
		: ticktickMapping;

	const quote = quoteForTime(now);
	return {
		trips,
		weather,
		quote,
		calendar,
		calendarList,
		ticktickAll,
		ticktickLists,
		deploy,
		config: getConfig(),
		chores: getChores({ now }),
		recipients: getRecipients(),
		now: now.toISOString()
	};
};
