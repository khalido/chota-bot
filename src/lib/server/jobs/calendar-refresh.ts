// Refresh calendar cache every 15 min for the two ranges we actually use:
// 'today' (morning print) and 'week' (dashboard CalendarCard).
import { defineJob } from '$lib/server/scheduler';
import { refreshCalendar } from '$lib/server/tools/calendar';

defineJob('calendar-refresh', '*/15 * * * *', async () => {
	const [todayEvents, weekEvents] = await Promise.all([
		refreshCalendar('today'),
		refreshCalendar('week')
	]);
	return `${todayEvents.length} today, ${weekEvents.length} this week`;
});
