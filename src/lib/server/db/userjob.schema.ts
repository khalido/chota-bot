import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Jobs made in chat: today, reminders ("remind me at 4 to leave"). One row per
 * job; `jobs/user-jobs.ts` fires the due ones every minute. Design:
 * docs/jobs.md §User jobs.
 */
export const userJob = sqliteTable(
	'user_job',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** A family member's name, or 'everyone'. */
		owner: text('owner').notNull(),
		createdBy: text('created_by').notNull(),
		text: text('text').notNull(),
		/** A repeat: 5-field cron in `timezone`. Null for a one-off. */
		cron: text('cron'),
		/** A one-off's time. Null for a repeat. */
		runAt: integer('run_at', { mode: 'timestamp_ms' }),
		/** Copied in at create time, so a schedule keeps meaning what it meant. */
		timezone: text('timezone').notNull(),
		/** Where it is delivered: the chat it was made in. */
		channel: text('channel', { enum: ['telegram', 'whatsapp'] }).notNull(),
		threadId: text('thread_id').notNull(),
		/** That chat's history key, so a reply to the reminder has it in context. */
		sessionKey: text('session_key').notNull(),
		/** False while paused. A one-off that has fired is deleted, not switched off. */
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		/** The slot it is due: sent once this is in the past. */
		nextRunAt: integer('next_run_at', { mode: 'timestamp_ms' }),
		/** After a failed send: not tried again before this. The slot stays put. */
		retryAt: integer('retry_at', { mode: 'timestamp_ms' }),
		errorCount: integer('error_count').notNull().default(0),
		lastError: text('last_error'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('user_job_due_idx').on(t.enabled, t.nextRunAt)]
);
