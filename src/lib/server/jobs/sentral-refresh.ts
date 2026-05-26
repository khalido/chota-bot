// Re-download each configured kid's Sentral timetable .ics across the school
// day. Morning ticks (06:30/07:30/08:30) keep the print cache current before
// the 06:45 morning print, and catch same-day school changes. An evening tick
// at 17:30 picks up any school updates pushed during/after class so a kid (or
// parent) viewing the dashboard after-school sees the latest, AND a "print
// tomorrow's brief" tonight has fresh data.
//
// If a session cookie has expired, refreshTimetable self-heals via
// agent-browser (`refreshSentralCookie`); the failure mode is fully
// unreachable Sentral, which logs here and the print degrades to the last
// good .ics on disk.
import { defineJob } from '$lib/server/scheduler';
import { configuredSentralKids, refreshTimetable } from '$lib/server/tools/sentral';

defineJob('sentral-refresh', '30 6,7,8,17 * * 1-5', async () => {
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
