// Daily 06:45 Sydney print. The family brief prints every day; each configured
// Sentral kid's brief prints on weekdays only (no school = nothing extra). Prints
// the designed image (a screenshot of /print/<who>); composeImage falls back to
// the canvas renderer if the screenshot path is unavailable. One recipient
// failing doesn't stop the rest.
//
// No retry/catch-up here yet — if the box was asleep at 06:45 or the printer was
// off, the run is just missed. See docs/jobs.md if/when we add a catch-up tick.
import { defineJob } from '$lib/server/scheduler';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';
import { configuredSentralKids } from '$lib/server/tools/sentral';
import { sydneyDayOfWeek } from '$lib/time';
import { logErr } from '$lib/server/log';
import { env } from '$env/dynamic/private';

defineJob('morning-print', '45 6 * * *', async () => {
	// Only the kiosk has a printer attached. On a dev machine this would log a
	// failure every morning at 06:45 — no thanks.
	if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';

	const weekend = sydneyDayOfWeek() === 'Sat' || sydneyDayOfWeek() === 'Sun';
	const recipients = weekend ? ['family'] : ['family', ...configuredSentralKids()];
	const results: string[] = [];
	for (const who of recipients) {
		try {
			const composed = await composeImage(who);
			if (!composed) throw new Error('composeImage returned null');
			const bytes = await printPng(composed.image);
			const tag = composed.fallback ? ` (canvas: ${composed.fallback})` : '';
			results.push(`${who} ${bytes}b${tag}`);
		} catch (err) {
			logErr('morning-print', `${who} failed:`, err);
			results.push(`${who} FAILED`);
		}
	}
	return `printed ${recipients.length} (${results.join(', ')})`;
});
