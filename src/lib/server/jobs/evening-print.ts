// Daily 19:15 Sydney print of *tomorrow's* brief — one sheet per family member
// (everyone in chota.config.ts) — so the family can prep the night before. A
// kid's sheet carries tomorrow's school timetable; the SCHOOL section
// auto-omits when tomorrow isn't a school day, so there's no weekday branching.
// The puzzle and "did you know" fact are dropped (sections.ts) — this is a
// get-ready sheet. One recipient failing doesn't stop the rest.
//
// No retry/catch-up — a missed 19:15 run is just missed (see docs/jobs.md).
import { defineJob } from '$lib/server/scheduler';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';
import { getRecipients } from '$lib/server/print/sections';
import { logErr } from '$lib/server/log';
import { env } from '$env/dynamic/private';

defineJob('evening-print', '15 19 * * *', async () => {
	// Only the kiosk has a printer attached. On a dev machine this would log a
	// failure every evening at 19:15 — no thanks.
	if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';

	const recipients = getRecipients();
	const results: string[] = [];
	for (const who of recipients) {
		try {
			const composed = await composeImage(who, undefined, 'tomorrow');
			if (!composed) throw new Error('composeImage returned null');
			const bytes = await printPng(composed.image);
			const tag = composed.fallback ? ` (canvas: ${composed.fallback})` : '';
			results.push(`${who} ${bytes}b${tag}`);
		} catch (err) {
			logErr('evening-print', `${who} failed:`, err);
			results.push(`${who} FAILED`);
		}
	}
	return `printed ${recipients.length} (${results.join(', ')})`;
});
