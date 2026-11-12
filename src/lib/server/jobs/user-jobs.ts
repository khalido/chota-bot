// Every minute: send the reminders that are due (rows in `user_job`, made in
// chat with the schedule tool). Kiosk only, so a dev Mac never sends one. The
// tick is every minute so a reminder is on time, not so one can repeat that
// often. Design: docs/jobs.md §User jobs.
import { defineJob } from '#lib/server/scheduler.ts';
import { dispatchDue } from '#lib/server/userjobs.ts';
import { sendTo } from '#lib/server/channels/index.ts';
import { KIOSK } from '$app/env/private';

defineJob(
	'user-jobs',
	'* * * * *',
	async () => {
		if (KIOSK !== 'true') return;
		const { sent, waiting } = await dispatchDue((channel, threadId, markdown) =>
			sendTo(channel, threadId, { markdown })
		);
		// A send that failed isn't a failed run: the row retries on its own
		// backoff and raises its own alert (see dispatchDue).
		const parts = [sent ? `sent ${sent}` : '', waiting ? `${waiting} waiting to retry` : ''];
		return parts.filter(Boolean).join(', ') || undefined;
	},
	{ logOk: false, recordIdle: false }
);
