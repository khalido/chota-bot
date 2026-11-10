// Every 30 min: alert when a print's slot passed with no run recorded — the box
// was off or restarting at that time, or the run was cut off. Raises the job's
// own `job:<name>` alert, so its next ok run sends the "working again". Also
// re-sends any open alert whose first send failed. Kiosk only.
import { defineJob, missedRuns } from '#lib/server/scheduler.ts';
import { raiseAlert, resendUnsent } from '#lib/server/alerts.ts';
import { sydneyHHMM } from '#lib/time.ts';
import { KIOSK } from '$app/env/private';

const MUST_RUN = ['morning-print', 'weekend-print'];

defineJob(
	'job-check',
	'*/30 * * * *',
	async () => {
		if (KIOSK !== 'true') return 'skipped (KIOSK env not set)';
		const missed = missedRuns(MUST_RUN);
		for (const { name, slot } of missed) {
			await raiseAlert(`job:${name}`, `Job ${name} missed its ${sydneyHHMM(slot)} run`);
		}
		const resent = await resendUnsent();
		const parts = [
			missed.length ? `missed: ${missed.map((m) => m.name).join(', ')}` : '',
			resent ? `re-sent ${resent} alert(s)` : ''
		].filter(Boolean);
		return parts.length ? parts.join('; ') : undefined;
	},
	{ logOk: false }
);
