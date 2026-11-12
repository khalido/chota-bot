/**
 * schedule agent-tool — reminders the bot sends at a time.
 *
 * Wraps `#lib/server/userjobs`. Who is asking arrives as tool context from the
 * channel router, never from the model: that decides whose reminders they see
 * and whether they may set one for someone else. Called without context (the
 * admin chat) it refuses.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { AskerSchema } from '#lib/server/tools/content.ts';
import {
	createJob,
	JobRefused,
	listJobs,
	MAX_AHEAD_MINUTES,
	removeJob,
	setPaused,
	updateJob,
	type UserJob
} from '#lib/server/userjobs.ts';
import { sydneyDateShort, sydneyHHMM } from '#lib/time.ts';

/** How many a list shows; the rest are counted. */
const LIST_MAX = 10;

const when = (d: Date | null) => (d ? `${sydneyDateShort(d)} ${sydneyHHMM(d)}` : null);

const summary = (j: UserJob) => ({
	id: j.id,
	text: j.text.length > 60 ? `${j.text.slice(0, 59)}…` : j.text,
	for: j.owner,
	...(j.cron ? { repeats: j.cron } : {}),
	next: when(j.nextRunAt),
	...(j.enabled ? {} : { paused: true }),
	// A send that keeps failing: the reminder is late, and the bot should say so.
	...(j.errorCount > 0 ? { sendFailing: j.lastError } : {})
});

export const scheduleTool = tool({
	description:
		'Reminders the bot sends as a message at a time: "remind me at 4 to leave for volleyball", "every weekday at 7:15 remind Kid1 to pack the recorder". ' +
		'Future messages only; never for something to do now. A to-do with no time of day ("remind me to book the dentist") is ticktick_add with a due date, not this. ' +
		'action=create needs text and exactly one of: at (a Sydney date and time), inMinutes ("in 20 minutes"), cron (a repeat). ' +
		'Write text so it reads as a reminder when it arrives on its own: "Leave for volleyball", not "that thing". ' +
		'Before creating a repeat, say the schedule back in plain words and wait for a yes; a one-off needs no confirmation. ' +
		'action=list shows the asker’s reminders. Always list before update, pause, resume or remove, and use the id from that list; never guess an id. ' +
		'If list is empty or fails, say so; do not create a copy. ' +
		'The reminder is delivered in the chat it was made in, so one for someone else or for everyone must be asked for in the family group; in a direct message it is always for the asker. ' +
		'Scheduled questions the bot answers later are not available yet.',
	inputSchema: z.object({
		action: z.enum(['create', 'list', 'update', 'pause', 'resume', 'remove']),
		id: z.number().int().describe('From list. For update, pause, resume, remove.').optional(),
		text: z.string().describe('The reminder as it will be sent.').optional(),
		at: z.string().describe('One-off, Sydney local time: 2026-11-12T16:00.').optional(),
		inMinutes: z
			.number()
			.int()
			.min(1)
			.max(MAX_AHEAD_MINUTES)
			.describe('One-off, this many minutes from now. Use for "in 20 minutes", "in 2 hours".')
			.optional(),
		cron: z
			.string()
			.describe(
				'Repeat, 5-field cron in Sydney time: "15 7 * * 1-5" is weekdays 07:15. Every 5 minutes at most.'
			)
			.optional(),
		for: z
			.string()
			.describe(
				'In a group: a family member, or "everyone". Leave out for the asker. With list, a parent can name someone or say "all".'
			)
			.optional()
	}),
	contextSchema: z.object({ asker: AskerSchema.optional() }),
	execute: async (input, { context }) => {
		const { asker } = context;
		try {
			switch (input.action) {
				case 'create': {
					if (!input.text) return { error: 'create needs text' };
					return { created: summary(createJob({ ...input, text: input.text }, asker)) };
				}
				case 'list': {
					const jobs = listJobs(asker, input.for);
					return {
						reminders: jobs.slice(0, LIST_MAX).map(summary),
						...(jobs.length > LIST_MAX ? { more: jobs.length - LIST_MAX } : {})
					};
				}
				default: {
					if (input.id === undefined) return { error: `${input.action} needs an id from list` };
					if (input.action === 'remove') return { removed: summary(removeJob(input.id, asker)) };
					if (input.action === 'update')
						return { updated: summary(updateJob(input.id, input, asker)) };
					const job = setPaused(input.id, input.action === 'pause', asker);
					return input.action === 'pause' ? { paused: summary(job) } : { resumed: summary(job) };
				}
			}
		} catch (err) {
			// A refusal is an answer for the model to pass on, not a crash.
			if (err instanceof JobRefused) return { error: err.message };
			throw err;
		}
	}
});
