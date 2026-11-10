// Refresh the NSW school calendar weekly. The data is static for the year, so
// this just keeps the in-memory cache warm — the morning brief never eats a
// fetch — and picks up any mid-year correction to the published dates.
import { defineJob } from '#lib/server/scheduler.ts';
import { refreshSchoolCalendar } from '#lib/server/tools/schoolterms.ts';

defineJob('schoolterms-refresh', '0 4 * * 1', async () => {
	const year = await refreshSchoolCalendar();
	return `${year.terms.length} terms, ${year.holidays.length} holiday blocks`;
});
