// Weekday 06:45 Sydney print — one sheet per auto-print family member
// (everyone in chota.config.ts whose `autoPrint` isn't false; parents can opt
// out while staying on-demand recipients). Mon–Fri only; the weekend brief is a separate
// `weekend-print` job (one family-wide sheet, no per-person split). A kid's
// sheet carries their school timetable. Prints the designed image (a
// screenshot of /print/<who>); composeImage falls back to the canvas renderer
// if the screenshot path is unavailable. One recipient failing doesn't stop
// the rest, but the run then fails (and alerts) naming who didn't print.
//
// No retry/catch-up here yet — if the box was asleep at 06:45 or the printer was
// off, the run is just missed. See docs/jobs.md if/when we add a catch-up tick.
import { defineJob } from '$lib/server/scheduler';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';
import { getAutoPrintRecipients } from '$lib/server/print/sections';
import { errorMessage, event } from '$lib/server/log';
import { env } from '$env/dynamic/private';

defineJob('morning-print', '45 6 * * 1-5', async () => {
	// Only the kiosk has a printer attached. On a dev machine this would log a
	// failure every morning at 06:45 — no thanks.
	if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';

	const recipients = getAutoPrintRecipients();
	const results: string[] = [];
	const failed: string[] = [];
	for (const who of recipients) {
		const ev = event('print', 'printed {who} ({source})', { who, source: 'morning-print' });
		try {
			const composed = await composeImage(who);
			if (!composed) throw new Error('composeImage returned null');
			const bytes = await printPng(composed.image);
			ev.set('bytes', bytes).set('renderer', composed.fallback ? 'canvas' : 'screenshot');
			if (composed.fallback) ev.set('fallback', composed.fallback);
			ev.done();
			const tag = composed.fallback ? ` (canvas: ${composed.fallback})` : '';
			results.push(`${who} ${bytes}b${tag}`);
		} catch (err) {
			ev.fail(err);
			failed.push(`${who}: ${errorMessage(err)}`);
		}
	}
	if (failed.length) {
		const ok = results.length ? ` (printed ${results.join(', ')})` : '';
		throw new Error(`${failed.join('; ')}${ok}`);
	}
	return `printed ${recipients.length} (${results.join(', ')})`;
});
