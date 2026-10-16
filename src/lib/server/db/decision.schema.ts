import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Every Jev judgment, probabilities and all (the decision-models house rules):
 * a threshold can move without asking again, and a "no, that wasn't for you"
 * reply can be stored as a label against the row. `questionsHash` ties a row
 * to the exact question text it was asked with.
 */
export const decision = sqliteTable(
	'decision',
	{
		id: text('id').primaryKey(),
		/** Which judgment: 'group-triage'. */
		kind: text('kind').notNull(),
		threadId: text('thread_id').notNull(),
		messageId: text('message_id').notNull(),
		model: text('model').notNull(),
		questionsHash: text('questions_hash').notNull(),
		/** JSON: { option: probability }. */
		probabilities: text('probabilities').notNull(),
		pick: text('pick').notNull(),
		/** Whether code acted on it (pick in `act` and over the threshold). */
		acted: integer('acted', { mode: 'boolean' }).notNull(),
		/** Who placed the label later: 'family' (a correction), null until then. */
		label: text('label'),
		createdAt: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('decision_kind_idx').on(t.kind, t.createdAt)]
);
