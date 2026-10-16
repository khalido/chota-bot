import { desc } from 'drizzle-orm';
import { JOBS } from '$lib/server/scheduler';
import { clearAlert, raiseAlert } from '$lib/server/alerts';
import { db } from '$lib/server/db';
import { alert } from '$lib/server/db/schema';
import type { Actions, PageServerLoad } from './$types';

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
		})),
		alerts: db
			.select()
			.from(alert)
			.orderBy(desc(alert.openedAt))
			.limit(20)
			.all()
			.map((a) => ({
				key: a.key,
				status: a.status,
				text: a.text,
				openedAt: a.openedAt.toISOString(),
				sent: a.sentAt !== null,
				resolvedAt: a.resolvedAt?.toISOString() ?? null
			}))
	};
};

export const actions: Actions = {
	/** Sends a ⚠️ then a ✅ through the real channel — proves delivery end to end. */
	testAlert: async () => {
		const sent = await raiseAlert('test', 'Test alert from /admin/jobs');
		await clearAlert('test', { recovered: 'Test alert cleared' });
		return { sent };
	}
};
