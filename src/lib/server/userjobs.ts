/**
 * Jobs made in chat. Today that is reminders: "remind me at 4 to leave",
 * "every weekday at 7 remind Kid1 about the recorder". Rows live in `user_job`;
 * `jobs/user-jobs.ts` calls `dispatchDue` every minute. Design: docs/jobs.md
 * §User jobs.
 *
 * Who may do what is decided here from the asker the channel router supplies,
 * never from model input. A reminder is delivered in the chat it was made in,
 * so the rules follow the chat: a direct message holds only your own; one for
 * someone else, or for everyone, is made in the family group where they see it.
 */
import { and, asc, eq, isNull, lte, or } from 'drizzle-orm';
import { Cron } from 'croner';
import { db } from '#lib/server/db/index.ts';
import { userJob } from '#lib/server/db/schema.ts';
import { findMember, isParent } from '#lib/server/config.ts';
import { clearAlert, raiseAlert } from '#lib/server/alerts.ts';
import { recordSent, sessionKeyFor } from '#lib/server/agent/history.ts';
import { log, logErr, errorMessage } from '#lib/server/log.ts';
import { SYDNEY_TZ, sydneyHHMM, sydneyNoon, sydneyTimeOnDay, sydneyYMD } from '#lib/time.ts';
import type { Asker } from '#lib/server/tools/content.ts';
import type { ChannelName } from '#lib/server/channels/types.ts';

const SCOPE = 'user-jobs';
export type UserJob = typeof userJob.$inferSelect;

export const EVERYONE = 'everyone';
export const MAX_PER_PERSON = 20;
/** A repeat can't come round faster than this. */
export const MIN_REPEAT_MS = 5 * 60_000;
export const MAX_AHEAD_MINUTES = 366 * 24 * 60;
const MAX_TEXT = 300;
/** Sent this long after its time, a reminder says so. */
const LATE_NOTE_MS = 2 * 60_000;
/** Older than this it is reported as missed, not sent as if it were current. */
const MISSED_MS = 12 * 60 * 60_000;
/** Gaps between tries of a send that failed; the last one repeats until it works. */
const BACKOFF_MS = [30_000, 60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** Failed tries before a parent is told. It keeps trying after that. */
const ALERT_AFTER = 5;
/** A send not settled by now counts as failed, so one hung socket can't hold the tick. */
const SEND_TIMEOUT_MS = 30_000;
const TICK_LIMIT = 25;

/** What is needed of who is asking and from where. */
export type JobAsker = Pick<Asker, 'sender' | 'isDM' | 'channel' | 'threadId' | 'quiet'>;

/** A refusal the bot should pass on in its own words. */
export class JobRefused extends Error {}

// ── schedule maths ──────────────────────────────────────────────────────────

/** When a job next runs after `from`: a repeat asks croner, a one-off is its own time. */
export function computeNextRun(
	job: Pick<UserJob, 'cron' | 'runAt' | 'timezone'>,
	from: Date
): Date | null {
	if (job.cron) return new Cron(job.cron, { timezone: job.timezone, paused: true }).nextRun(from);
	return job.runAt;
}

/** The shortest gap between a pattern's next few runs. Throws on a bad pattern. */
export function shortestGapMs(cron: string, timezone: string, from: Date): number {
	const runs = new Cron(cron, { timezone, paused: true }).nextRuns(6, from);
	let gap = Infinity;
	for (let i = 1; i < runs.length; i++)
		gap = Math.min(gap, runs[i].getTime() - runs[i - 1].getTime());
	return gap;
}

/** `2026-11-12T16:00`, Sydney wall time, as an instant. Null if it isn't that shape or isn't a real time. */
export function parseLocal(at: string): Date | null {
	const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(at);
	if (!m) return null;
	const noon = sydneyNoon(m[1]);
	if (Number.isNaN(noon.getTime()) || sydneyYMD(noon) !== m[1]) return null;
	return sydneyTimeOnDay(`${m[2]}:${m[3]}`, noon);
}

// ── who may do what ─────────────────────────────────────────────────────────

/** The asker, checked: a known family member on a turn they started. */
function knownAsker(asker: JobAsker | undefined): JobAsker & { sender: string } {
	const who = asker?.sender ? findMember(asker.sender) : undefined;
	if (!asker || !who)
		throw new JobRefused('reminders need a family member asking from WhatsApp or Telegram');
	if (asker.quiet) throw new JobRefused('not on an overheard message');
	return { ...asker, sender: who.name };
}

/** May `sender` change or remove this job? Its owner, whoever made it, or a parent. */
const mayChange = (job: UserJob, sender: string) =>
	job.owner === sender || job.createdBy === sender || isParent(sender);

/** A repeat that lands in a shared chat pings everyone there: a parent's call. */
function checkRepeat(cron: string | null, asker: { sender: string; isDM: boolean }) {
	if (cron && !asker.isDM && !isParent(asker.sender))
		throw new JobRefused('only a parent can set a repeating reminder in a group chat');
}

// ── create, list, change ────────────────────────────────────────────────────

export interface NewJob {
	text: string;
	/** Exactly one of these three. */
	at?: string;
	inMinutes?: number;
	cron?: string;
	/** A family member, or 'everyone'. Left out: the asker. */
	for?: string;
}

/** Turn the three ways of saying when into a one-off time or a checked pattern. */
function parseWhen(
	input: Pick<NewJob, 'at' | 'inMinutes' | 'cron'>,
	now: Date
): { cron: string | null; runAt: Date | null } {
	const given = [input.at, input.inMinutes, input.cron].filter((v) => v !== undefined).length;
	if (given !== 1) throw new JobRefused('give exactly one of at, inMinutes or cron');
	if (input.cron !== undefined) {
		let gap: number;
		try {
			gap = shortestGapMs(input.cron, SYDNEY_TZ, now);
		} catch (err) {
			throw new JobRefused(`"${input.cron}" is not a cron pattern: ${errorMessage(err)}`);
		}
		if (!Number.isFinite(gap)) throw new JobRefused(`"${input.cron}" never repeats; use at`);
		if (gap < MIN_REPEAT_MS) throw new JobRefused('a reminder can repeat every 5 minutes at most');
		return { cron: input.cron, runAt: null };
	}
	if (input.inMinutes !== undefined) {
		const mins = input.inMinutes;
		if (!Number.isInteger(mins) || mins < 1 || mins > MAX_AHEAD_MINUTES)
			throw new JobRefused('inMinutes must be a whole number from 1 to a year of minutes');
		return { cron: null, runAt: new Date(now.getTime() + mins * 60_000) };
	}
	const runAt = parseLocal(input.at!);
	if (!runAt) throw new JobRefused(`"${input.at}" is not a time like 2026-11-12T16:00`);
	if (runAt.getTime() <= now.getTime())
		throw new JobRefused(`that time has passed (it is ${sydneyYMD(now)} ${sydneyHHMM(now)})`);
	if (runAt.getTime() - now.getTime() > MAX_AHEAD_MINUTES * 60_000)
		throw new JobRefused('a reminder can be at most a year ahead');
	return { cron: null, runAt };
}

function checkText(raw: string): string {
	const text = raw.trim();
	if (!text) throw new JobRefused('the reminder has no text');
	if (text.length > MAX_TEXT)
		throw new JobRefused(`keep the reminder under ${MAX_TEXT} characters`);
	return text;
}

export function createJob(
	input: NewJob,
	rawAsker: JobAsker | undefined,
	now = new Date()
): UserJob {
	const asker = knownAsker(rawAsker);
	const text = checkText(input.text);
	const when = parseWhen(input, now);
	checkRepeat(when.cron, asker);

	let owner = asker.sender;
	if (input.for) {
		const everyone = input.for.trim().toLowerCase() === EVERYONE;
		const who = everyone ? undefined : findMember(input.for);
		if (!everyone && !who) throw new JobRefused(`"${input.for}" is not a family member`);
		owner = everyone ? EVERYONE : who!.name;
	}
	if (owner !== asker.sender) {
		// It arrives in this chat. In a direct message the others would never see it.
		if (asker.isDM)
			throw new JobRefused(
				'a reminder is sent in the chat it is made in; ask in the family group to remind someone else or everyone'
			);
		if (owner !== EVERYONE && !isParent(asker.sender))
			throw new JobRefused('only a parent can set a reminder for someone else');
	}

	const held = db
		.select({ id: userJob.id })
		.from(userJob)
		.where(eq(userJob.owner, owner))
		.all().length;
	if (held >= MAX_PER_PERSON)
		throw new JobRefused(`${owner} already has ${MAX_PER_PERSON} reminders; remove one first`);

	const row = { ...when, timezone: SYDNEY_TZ };
	return db
		.insert(userJob)
		.values({
			...row,
			owner,
			createdBy: asker.sender,
			text,
			channel: asker.channel as ChannelName,
			threadId: asker.threadId,
			sessionKey: sessionKeyFor({
				threadId: asker.threadId,
				isDM: asker.isDM,
				person: { name: asker.sender }
			}),
			nextRunAt: computeNextRun(row, now),
			createdAt: now
		})
		.returning()
		.get();
}

/**
 * The jobs the asker may see, paused ones included, soonest first. In a
 * group: the ones delivered to that group, so nothing made in a direct
 * message shows there. In a direct message: their own, everyone's and any
 * they made; a parent can ask for another person's, or 'all'.
 */
export function listJobs(rawAsker: JobAsker | undefined, forWho?: string): UserJob[] {
	const asker = knownAsker(rawAsker);
	let where;
	if (!asker.isDM) {
		where = eq(userJob.threadId, asker.threadId);
	} else if (forWho && forWho.trim().toLowerCase() === 'all') {
		if (!isParent(asker.sender))
			throw new JobRefused("only a parent can list everyone's reminders");
		where = undefined;
	} else if (forWho && findMember(forWho)?.name !== asker.sender) {
		const who = findMember(forWho);
		if (!who) throw new JobRefused(`"${forWho}" is not a family member`);
		if (!isParent(asker.sender))
			throw new JobRefused("only a parent can list someone else's reminders");
		where = eq(userJob.owner, who.name);
	} else {
		where = or(
			eq(userJob.owner, asker.sender),
			eq(userJob.owner, EVERYONE),
			eq(userJob.createdBy, asker.sender)
		);
	}
	return db.select().from(userJob).where(where).orderBy(asc(userJob.nextRunAt)).all();
}

/** One person's reminders plus everyone's, for the phone page. */
export function jobsFor(owner: string): UserJob[] {
	return db
		.select()
		.from(userJob)
		.where(or(eq(userJob.owner, owner), eq(userJob.owner, EVERYONE)))
		.orderBy(asc(userJob.nextRunAt))
		.all();
}

function ownJob(id: number, asker: { sender: string }): UserJob {
	const job = db.select().from(userJob).where(eq(userJob.id, id)).get();
	// One answer for "no such job" and "not yours", so ids can't be probed.
	if (!job || !mayChange(job, asker.sender))
		throw new JobRefused(`no reminder ${id} of yours; list them first`);
	return job;
}

export function removeJob(id: number, rawAsker: JobAsker | undefined): UserJob {
	const job = ownJob(id, knownAsker(rawAsker));
	db.delete(userJob).where(eq(userJob.id, id)).run();
	return job;
}

/** Pause or resume. Resuming a repeat picks up at its next slot, not the ones missed. */
export function setPaused(
	id: number,
	paused: boolean,
	rawAsker: JobAsker | undefined,
	now = new Date()
): UserJob {
	const job = ownJob(id, knownAsker(rawAsker));
	if (!paused && !job.cron && job.runAt && job.runAt.getTime() <= now.getTime())
		throw new JobRefused('its time has passed while paused; set a new time with update');
	return db
		.update(userJob)
		.set({
			enabled: !paused,
			nextRunAt: paused ? job.nextRunAt : computeNextRun(job, now),
			retryAt: null,
			errorCount: 0,
			lastError: null
		})
		.where(eq(userJob.id, id))
		.returning()
		.get();
}

/** New text, a new time, or both. A new time also un-pauses it. */
export function updateJob(
	id: number,
	change: Partial<Pick<NewJob, 'text' | 'at' | 'inMinutes' | 'cron'>>,
	rawAsker: JobAsker | undefined,
	now = new Date()
): UserJob {
	const asker = knownAsker(rawAsker);
	const job = ownJob(id, asker);
	const set: Partial<typeof userJob.$inferInsert> = {};
	if (change.text !== undefined) set.text = checkText(change.text);
	if (change.at !== undefined || change.inMinutes !== undefined || change.cron !== undefined) {
		const when = parseWhen(change, now);
		// Judged by where it is delivered, which may not be where this was asked.
		checkRepeat(when.cron, { sender: asker.sender, isDM: job.sessionKey.startsWith('person:') });
		Object.assign(set, when, {
			nextRunAt: computeNextRun({ ...when, timezone: job.timezone }, now),
			enabled: true,
			retryAt: null,
			errorCount: 0,
			lastError: null
		});
	}
	if (!Object.keys(set).length) throw new JobRefused('nothing to change');
	return db.update(userJob).set(set).where(eq(userJob.id, id)).returning().get();
}

// ── firing ──────────────────────────────────────────────────────────────────

export type JobSend = (channel: ChannelName, threadId: string, markdown: string) => Promise<void>;

/** The message for a fire. A reminder for one person in a shared chat names them. */
export function reminderText(job: UserJob, now: Date): string {
	const due = job.nextRunAt ?? now;
	const lateMs = now.getTime() - due.getTime();
	const shared = !job.sessionKey.startsWith('person:');
	const who = shared && job.owner !== EVERYONE ? `${job.owner}: ` : '';
	if (lateMs > MISSED_MS)
		return `⏰ ${who}I missed a reminder set for ${sydneyYMD(due)} ${sydneyHHMM(due)}: ${job.text}`;
	const late = lateMs > LATE_NOTE_MS ? ` (late: was for ${sydneyHHMM(due)})` : '';
	return `⏰ ${who}${job.text}${late}`;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error(`send timed out after ${ms / 1000}s`)), ms);
	});
	return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Send every due reminder. `next_run_at` is the slot it was due and moves only
 * once the send has worked; a failed send sets `retry_at` and leaves the slot
 * alone, so the reminder still goes out, marked late, when the channel is
 * back. Nothing is dropped: after five failures a parent is told, and it keeps
 * trying. `waiting` counts the ones not sent this tick.
 */
export async function dispatchDue(
	send: JobSend,
	now = new Date()
): Promise<{ sent: number; waiting: number }> {
	const due = db
		.select()
		.from(userJob)
		.where(
			and(
				eq(userJob.enabled, true),
				lte(userJob.nextRunAt, now),
				or(isNull(userJob.retryAt), lte(userJob.retryAt, now))
			)
		)
		.orderBy(asc(userJob.nextRunAt))
		.limit(TICK_LIMIT)
		.all();

	let sent = 0;
	let waiting = 0;
	for (const job of due) {
		const text = reminderText(job, now);
		try {
			await withTimeout(send(job.channel, job.threadId, text), SEND_TIMEOUT_MS);
		} catch (err) {
			waiting++;
			const failures = job.errorCount + 1;
			const gap = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1];
			db.update(userJob)
				.set({
					errorCount: failures,
					lastError: errorMessage(err),
					retryAt: new Date(now.getTime() + gap)
				})
				.where(eq(userJob.id, job.id))
				.run();
			logErr(SCOPE, `reminder ${job.id} not sent (try ${failures})`, err);
			if (failures >= ALERT_AFTER)
				await raiseAlert(
					`user-job:${job.id}`,
					`Reminder ${job.id} for ${job.owner} has failed ${failures} times and is still being tried: ${errorMessage(err)}`
				);
			continue;
		}
		sent++;
		// Sent. A one-off is done and goes; a repeat moves to its next slot.
		const next = job.cron ? computeNextRun(job, now) : null;
		if (next)
			db.update(userJob)
				.set({ nextRunAt: next, retryAt: null, errorCount: 0, lastError: null })
				.where(eq(userJob.id, job.id))
				.run();
		else db.delete(userJob).where(eq(userJob.id, job.id)).run();
		if (job.errorCount >= ALERT_AFTER)
			await clearAlert(`user-job:${job.id}`, { recovered: `Reminder ${job.id} was sent` });
		try {
			recordSent(job.sessionKey, text, job.channel);
		} catch (err) {
			logErr(SCOPE, `reminder ${job.id} sent but not recorded in chat history`, err);
		}
		log(SCOPE, `reminder ${job.id} sent to ${job.owner}`);
	}
	return { sent, waiting };
}
