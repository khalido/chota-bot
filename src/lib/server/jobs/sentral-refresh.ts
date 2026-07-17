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
	// One kid at a time, with a short breather in between. The kids' session
	// cookies expire on the same weekly cadence (sentral-login, Mondays), so a
	// parallel run would fire concurrent SAML re-logins — serialized here, and
	// belt-and-braces via the withBrowser() mutex inside loginSentral. The gap
	// also keeps us a polite client of the school's Sentral instance.
	const results: string[] = [];
	for (const kid of kids) {
		if (results.length > 0) await new Promise((r) => setTimeout(r, 3_000));
		try {
			const { events } = await refreshTimetable(kid);
			results.push(`${kid}: ${events} events`);
		} catch (err) {
			results.push(`${kid}: FAILED (${err instanceof Error ? err.message : err})`);
		}
	}
	return results.join('; ');
});
