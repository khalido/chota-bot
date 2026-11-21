// 08:30 daily: close the board the 07:00 job put up (KO, 18 Nov: the morning run is done by then). Only the board:
// a TV playing anything else is left alone, and one already closed is a no-op. Cast has no power-off, so the TV
// then goes to standby on its own energy timer (Google TV's Settings > System > Energy). Kiosk only.
import { KIOSK } from '$app/env/private';
import { defineJob } from '#lib/server/scheduler.ts';
import { DEFAULT_TV, stopTv, tvsShowing } from '#lib/server/tv/cast.ts';

defineJob('tv-morning-off', '30 8 * * *', async () => {
	if (KIOSK !== 'true') return;
	if (!tvsShowing().some((n) => n.toLowerCase() === DEFAULT_TV.toLowerCase()))
		return 'board not showing; left the TV alone';
	const r = await stopTv();
	if (!r.ok) throw new Error(r.error);
	return `closed the board on ${DEFAULT_TV}`;
});
