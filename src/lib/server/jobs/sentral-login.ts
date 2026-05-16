// Pre-emptively refresh each kid's Sentral session cookie at the start of the
// school week, via agent-browser login. `refreshTimetable` also self-heals on
// demand — this just moves the slow (~90s), occasionally-flaky browser login
// out of the 06:30 weekday-morning window so the morning refresh stays a fast
// fetch. Runs the kids one at a time: agent-browser is a single shared browser.
//
// Monday 04:00 is a guess at the cadence — once LogTape lands we can see how
// often the cookie actually expires and tune this (or drop it).
import { defineJob } from '$lib/server/scheduler';
import { configuredSentralKids, refreshSentralCookie } from '$lib/server/tools/sentral';

defineJob('sentral-login', '0 4 * * 1', async () => {
	const kids = configuredSentralKids();
	if (kids.length === 0) return 'no kids configured';
	const out: string[] = [];
	for (const kid of kids) {
		try {
			await refreshSentralCookie(kid);
			out.push(`${kid}: ok`);
		} catch (err) {
			out.push(`${kid}: FAILED (${err instanceof Error ? err.message : String(err)})`);
		}
	}
	return out.join('; ');
});
