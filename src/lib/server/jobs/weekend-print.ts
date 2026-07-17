// Friday 18:00 Sydney print — one whole-family weekend sheet (not per-person):
// THIS WEEKEND (the Sat+Sun family calendar), volleyball games + duty rosters,
// chores, shopping, plus the puzzle / quote tail. Lands on the fridge Friday
// evening so the weekend can be planned before it starts — this replaced the
// Sat+Sun 06:45 morning prints. Weekdays stay the per-person `morning-print`.
//
// Composed as a Friday `day: 'today'` brief: gatherBrief populates
// `weekendEvents` + `volleyball` on Fridays, and the family sheet renders
// THIS WEEKEND whenever those are present. (Masthead + chores show Friday —
// acceptable; a dedicated 'weekend' gather mode isn't worth it yet.)
//
// No retry/catch-up — a missed run is just missed (see docs/jobs.md).
import { defineJob } from '$lib/server/scheduler';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';
import { FAMILY_RECIPIENT } from '$lib/server/print/sections';
import { event } from '$lib/server/log';
import { env } from '$env/dynamic/private';

defineJob('weekend-print', '0 18 * * 5', async () => {
	if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';
	const ev = event('print', 'printed {who} ({source})', {
		who: FAMILY_RECIPIENT,
		source: 'weekend-print'
	});
	try {
		const composed = await composeImage(FAMILY_RECIPIENT, undefined, 'today');
		if (!composed) throw new Error('composeImage returned null');
		const bytes = await printPng(composed.image);
		ev.set('bytes', bytes).set('renderer', composed.fallback ? 'canvas' : 'screenshot');
		if (composed.fallback) ev.set('fallback', composed.fallback);
		ev.done();
		const tag = composed.fallback ? ` (canvas: ${composed.fallback})` : '';
		return `family ${bytes}b${tag}`;
	} catch (err) {
		ev.fail(err);
		return 'family FAILED';
	}
});
