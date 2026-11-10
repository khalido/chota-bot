// Pre-emptively refresh each kid's Sentral session cookie at the start of the
// school week, via agent-browser login. `refreshTimetable` also self-heals on
// demand — this just moves the slow (~90s), occasionally-flaky browser login
// out of the 06:30 weekday-morning window so the morning refresh stays a fast
// fetch. Runs the kids one at a time: agent-browser is a single shared browser.
//
// Monday 04:00 is a guess at the cadence — once LogTape lands we can see how
// often the cookie actually expires and tune this (or drop it).
import { defineJob } from '#lib/server/scheduler.ts';
import { configuredSentralKids, refreshSentralCookie } from '#lib/server/tools/sentral.ts';
import { errorMessage } from '#lib/utils.ts';

defineJob('sentral-login', '0 4 * * 1', async () => {
	const kids = configuredSentralKids();
	if (kids.length === 0) return 'no kids configured';
	const out: string[] = [];
	const failed: string[] = [];
	for (const kid of kids) {
		try {
			await refreshSentralCookie(kid);
			out.push(`${kid}: ok`);
		} catch (err) {
			out.push(`${kid}: FAILED (${errorMessage(err)})`);
			failed.push(kid);
		}
	}
	// Every kid is tried first; then a failure fails the job, so it alerts.
	if (failed.length) throw new Error(out.join('; '));
	return out.join('; ');
});
