import { JOBS } from '$lib/server/scheduler';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		jobs: JOBS.map((j) => ({
			name: j.name,
			pattern: j.pattern,
			nextRun: j.cron.nextRun()?.toISOString() ?? null,
			previousRun: j.cron.previousRun()?.toISOString() ?? null,
			isRunning: j.cron.isRunning(),
			recent: j.recent.map((r) => ({
				at: r.at.toISOString(),
				status: r.status,
				durationMs: r.durationMs,
				error: r.error
			}))
		}))
	};
};
