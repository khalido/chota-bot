// Weekend 06:45 Sydney print — one whole-family sheet (not per-person) with
// weather, every event, every open task, chores, shopping, plus the puzzle /
// quote / fact tail. Sat + Sun only; weekdays are the per-person
// `morning-print` job. A bigger weekend puzzle slot can land later inside the
// `family` recipient's tail without changing this file.
//
// No retry/catch-up — a missed 06:45 run is just missed (see docs/jobs.md).
import { defineJob } from '$lib/server/scheduler';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';
import { FAMILY_RECIPIENT } from '$lib/server/print/sections';
import { logErr } from '$lib/server/log';
import { env } from '$env/dynamic/private';

// `0,6` = Sun + Sat (cron: Sun=0). The five weekdays are handled by morning-print.
defineJob('weekend-print', '45 6 * * 0,6', async () => {
	if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';
	try {
		const composed = await composeImage(FAMILY_RECIPIENT, undefined, 'today');
		if (!composed) throw new Error('composeImage returned null');
		const bytes = await printPng(composed.image);
		const tag = composed.fallback ? ` (canvas: ${composed.fallback})` : '';
		return `family ${bytes}b${tag}`;
	} catch (err) {
		logErr('weekend-print', 'failed:', err);
		return 'family FAILED';
	}
});
