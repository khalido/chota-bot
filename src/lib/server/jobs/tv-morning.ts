// 07:00 daily (KO moved it from 07:15, 18 Nov): put the board's Today briefing on the living-room TV, waking it if it's off (KO, 17 Nov: no sound, so that's fine). Skips a TV playing something else. Kiosk only.
import { KIOSK } from '$app/env/private';
import { defineJob } from '#lib/server/scheduler.ts';
import { launchTv } from '#lib/server/tv/cast.ts';

defineJob('tv-morning', '0 7 * * *', async () => {
	if (KIOSK !== 'true') return;
	const r = await launchTv({ show: 'today' });
	if (r.ok) return `on ${r.tv}`;
	if (r.busyWith) return `skipped: ${r.error} (${r.busyWith})`;
	throw new Error(r.error);
});
