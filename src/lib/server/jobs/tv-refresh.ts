// Every minute: update the TV board (cast/ receiver) on any TV already showing it, when its screens changed. Never launches. Kiosk only.
import { KIOSK } from '$app/env/private';
import { defineJob } from '#lib/server/scheduler.ts';
import { refreshTv } from '#lib/server/tv/cast.ts';

defineJob(
	'tv-refresh',
	'* * * * *',
	async () => {
		if (KIOSK !== 'true') return;
		const sent = await refreshTv();
		return sent.length ? `sent to ${sent.join(', ')}` : undefined;
	},
	{ logOk: false, recordIdle: false, alertAfter: 3 }
);
