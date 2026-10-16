import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * One row per scheduled fire (ok, error, or a skipped stale fire). Survives
 * restarts, so /admin/jobs and the missed-run check (`jobs/job-check.ts`) can
 * still answer "did the 06:45 print run?" after a deploy. Pruned to 30 days.
 */
export const jobRun = sqliteTable(
	'job_run',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		at: integer('at', { mode: 'timestamp_ms' }).notNull(),
		status: text('status', { enum: ['ok', 'error', 'skipped'] }).notNull(),
		durationMs: integer('duration_ms').notNull(),
		summary: text('summary'),
		error: text('error')
	},
	(t) => [index('job_run_job_at_idx').on(t.job, t.at)]
);
