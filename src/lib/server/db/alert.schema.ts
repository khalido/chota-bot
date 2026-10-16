import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Open and recent alerts, one row per key (`job:morning-print`, `printer`).
 * State, not history: the log has every event; this row decides whether to
 * send again (one message per problem, a repeat only after a long gap) and
 * whether a recovery is worth a "back to normal". Survives restarts, so a
 * deploy doesn't resend open alerts.
 */
export const alert = sqliteTable('alert', {
	key: text('key').primaryKey(),
	status: text('status', { enum: ['open', 'resolved'] }).notNull(),
	/** The latest problem text. */
	text: text('text').notNull(),
	openedAt: integer('opened_at', { mode: 'timestamp_ms' }).notNull(),
	/** When a message last went out for this problem; null if none was sent
	 *  (no channel yet), so no "back to normal" follows either. */
	sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
	/** Good checks in a row since it opened — a flaky device needs several. */
	okStreak: integer('ok_streak').notNull().default(0),
	resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' })
});
