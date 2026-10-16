// Every 30 min: alert when a print's slot passed with no run recorded — the box
// was off or restarting at that time, or the run was cut off. Raises the job's
// own `job:<name>` alert, so its next ok run sends the "working again". Kiosk only.
import { defineJob, missedRuns } from '$lib/server/scheduler';
import { raiseAlert } from '$lib/server/alerts';
import { sydneyHHMM } from '$lib/time';
import { env } from '$env/dynamic/private';

const MUST_RUN = ['morning-print', 'weekend-print'];

defineJob(
	'job-check',
	'*/30 * * * *',
	async () => {
		if (env.KIOSK !== 'true') return 'skipped (KIOSK env not set)';
		const missed = missedRuns(MUST_RUN);
		for (const { name, slot } of missed) {
			await raiseAlert(`job:${name}`, `Job ${name} missed its ${sydneyHHMM(slot)} run`);
		}
		return missed.length ? `missed: ${missed.map((m) => m.name).join(', ')}` : undefined;
	},
	{ logOk: false }
);
