// Re-download each configured kid's Sentral timetable .ics on school mornings,
// before the 06:45 print. The school re-jigs timetables often, so a few pulls
// across the morning keep the cache current. If a session cookie has expired,
// refreshTimetable throws — that's logged here (and the print degrades to the
// last good .ics); re-copy SENTRAL_<NAME>_COOKIE in .env when you see it.
import { defineJob } from '$lib/server/scheduler';
import { configuredSentralKids, refreshTimetable } from '$lib/server/tools/sentral';

defineJob('sentral-refresh', '30 6,7,8 * * 1-5', async () => {
	const kids = configuredSentralKids();
	if (kids.length === 0) return 'no kids configured';
	const results = await Promise.allSettled(kids.map((k) => refreshTimetable(k)));
	return results
		.map((r, i) =>
			r.status === 'fulfilled'
				? `${kids[i]}: ${r.value.events} events`
				: `${kids[i]}: FAILED (${r.reason instanceof Error ? r.reason.message : r.reason})`
		)
		.join('; ');
});
