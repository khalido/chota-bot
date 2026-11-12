import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '#lib/server/db/schema.ts';

const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE user_job (
	id integer PRIMARY KEY AUTOINCREMENT NOT NULL, owner text NOT NULL, created_by text NOT NULL,
	text text NOT NULL, cron text, run_at integer, timezone text NOT NULL, channel text NOT NULL,
	thread_id text NOT NULL, session_key text NOT NULL, enabled integer NOT NULL DEFAULT 1,
	next_run_at integer, retry_at integer, error_count integer NOT NULL DEFAULT 0,
	last_error text, created_at integer NOT NULL);`);
const db = drizzle(sqlite, { schema });
vi.mock('#lib/server/db/index.ts', () => ({ db }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
const FAMILY = [
	{ name: 'Parent1', role: 'parent', aliases: ['Parent1', 'Mum'] },
	{ name: 'Kid1', role: 'kid', aliases: ['Kid1'] },
	{ name: 'Kid2', role: 'kid', aliases: ['Kid2'] }
];
vi.mock('#lib/server/config.ts', () => ({
	findMember: (name: string) =>
		FAMILY.find((f) =>
			[f.name, ...f.aliases].some((a) => a.toLowerCase() === name.trim().toLowerCase())
		)
}));
const raiseAlert = vi.fn();
const clearAlert = vi.fn();
vi.mock('#lib/server/alerts.ts', () => ({ raiseAlert, clearAlert }));
const recordSent = vi.fn();
vi.mock('#lib/server/agent/history.ts', () => ({
	recordSent,
	sessionKeyFor: (m: { threadId: string; isDM: boolean; person: { name: string } | null }) =>
		m.isDM && m.person ? `person:${m.person.name}/main` : `group:${m.threadId}/main`
}));

const {
	computeNextRun,
	createJob,
	dispatchDue,
	JobRefused,
	listJobs,
	parseLocal,
	removeJob,
	setPaused,
	shortestGapMs,
	updateJob
} = await import('./userjobs');

const TZ = 'Australia/Sydney';
const at = (iso: string) => new Date(iso);
// Thu 12 Nov 2026 09:00 Sydney (AEDT, +11).
const NOW = at('2026-11-12T09:00:00+11:00');
const dm = (sender: string | null) => ({
	sender,
	isDM: true,
	channel: 'whatsapp',
	threadId: `wa:${sender}`
});
const group = (sender: string) => ({ sender, isDM: false, channel: 'whatsapp', threadId: 'wa:g1' });

beforeEach(() => {
	sqlite.exec('DELETE FROM user_job');
	raiseAlert.mockClear();
	clearAlert.mockClear();
	recordSent.mockClear();
});

describe('computeNextRun', () => {
	const cases: [string, string, string, string][] = [
		[
			'weekday mornings, from Thursday',
			'15 7 * * 1-5',
			'2026-11-12T09:00:00+11:00',
			'2026-11-13T07:15:00+11:00'
		],
		[
			'weekday mornings, from Friday night',
			'15 7 * * 1-5',
			'2026-11-13T20:00:00+11:00',
			'2026-11-16T07:15:00+11:00'
		],
		[
			'31st skips short months',
			'0 9 31 * *',
			'2026-11-12T09:00:00+11:00',
			'2026-12-31T09:00:00+11:00'
		],
		// DST ends Sun 4 Apr 2027, 03:00 → 02:00: 07:00 stays 07:00 on the wall, now +10.
		[
			'a 07:00 job across the end of DST',
			'0 7 * * *',
			'2027-04-03T08:00:00+11:00',
			'2027-04-04T07:00:00+10:00'
		],
		// DST starts Sun 3 Oct 2027, 02:00 → 03:00: 02:30 doesn't exist that day.
		[
			'a job inside the spring-forward gap',
			'30 2 * * *',
			'2027-10-02T12:00:00+10:00',
			'2027-10-03T03:00:00+11:00'
		]
	];
	it.each(cases)('%s', (_name, cron, from, want) => {
		expect(computeNextRun({ cron, runAt: null, timezone: TZ }, at(from))).toEqual(at(want));
	});

	it('a one-off is its own time', () => {
		const runAt = at('2026-11-12T16:00:00+11:00');
		expect(computeNextRun({ cron: null, runAt, timezone: TZ }, NOW)).toEqual(runAt);
	});
});

describe('parseLocal and shortestGapMs', () => {
	it('reads Sydney wall time on either side of DST', () => {
		expect(parseLocal('2026-11-12T16:00')).toEqual(at('2026-11-12T16:00:00+11:00'));
		expect(parseLocal('2026-07-01T16:00')).toEqual(at('2026-07-01T16:00:00+10:00'));
	});
	it('rejects other shapes and dates that do not exist', () => {
		expect(parseLocal('4pm')).toBeNull();
		expect(parseLocal('2026-11-12T25:00')).toBeNull();
		expect(parseLocal('2026-02-30T10:00')).toBeNull();
	});
	it('finds the tightest gap in a pattern', () => {
		expect(shortestGapMs('*/5 * * * *', TZ, NOW)).toBe(5 * 60_000);
		expect(shortestGapMs('0,1 9 * * *', TZ, NOW)).toBe(60_000);
	});
});

describe('createJob', () => {
	it('makes a one-off for the asker, delivered where it was asked', () => {
		const job = createJob(
			{ text: ' Leave for volleyball ', at: '2026-11-12T16:00' },
			dm('Kid1'),
			NOW
		);
		expect(job).toMatchObject({
			owner: 'Kid1',
			createdBy: 'Kid1',
			text: 'Leave for volleyball',
			cron: null,
			channel: 'whatsapp',
			threadId: 'wa:Kid1',
			sessionKey: 'person:Kid1/main',
			enabled: true,
			nextRunAt: at('2026-11-12T16:00:00+11:00')
		});
	});

	it('takes "in 20 minutes" from the server clock', () => {
		const job = createJob({ text: 'Oven', inMinutes: 20 }, dm('Kid1'), NOW);
		expect(job.nextRunAt).toEqual(at('2026-11-12T09:20:00+11:00'));
	});

	it('refuses with no known asker, and on an overheard message', () => {
		expect(() => createJob({ text: 'x', inMinutes: 5 }, undefined, NOW)).toThrow(JobRefused);
		expect(() => createJob({ text: 'x', inMinutes: 5 }, dm(null), NOW)).toThrow(JobRefused);
		expect(() => createJob({ text: 'x', inMinutes: 5 }, dm('Stranger'), NOW)).toThrow(JobRefused);
		expect(() =>
			createJob({ text: 'x', inMinutes: 5 }, { ...group('Kid1'), quiet: true }, NOW)
		).toThrow(/overheard/);
	});

	it('keeps a direct message to your own: someone else or everyone is asked for in the group', () => {
		for (const who of ['Kid2', 'everyone'])
			expect(() => createJob({ text: 'x', inMinutes: 5, for: who }, dm('Parent1'), NOW)).toThrow(
				/family group/
			);
		expect(createJob({ text: 'x', inMinutes: 5, for: 'parent1' }, dm('Parent1'), NOW).owner).toBe(
			'Parent1'
		);
	});

	it('in a group, lets only a parent set one for someone else', () => {
		expect(() => createJob({ text: 'x', inMinutes: 5, for: 'Kid2' }, group('Kid1'), NOW)).toThrow(
			/only a parent/
		);
		expect(
			createJob({ text: 'x', inMinutes: 5, for: 'kid2' }, group('Parent1'), NOW)
		).toMatchObject({
			owner: 'Kid2',
			createdBy: 'Parent1',
			threadId: 'wa:g1'
		});
	});

	it('in a group, lets a kid remind everyone once but only a parent set a repeat', () => {
		expect(
			createJob({ text: 'Dinner', inMinutes: 5, for: 'everyone' }, group('Kid1'), NOW).owner
		).toBe('everyone');
		expect(() => createJob({ text: 'Mine', cron: '0 18 * * *' }, group('Kid1'), NOW)).toThrow(
			/only a parent/
		);
		expect(createJob({ text: 'Mine', cron: '0 18 * * *' }, dm('Kid1'), NOW).cron).toBe(
			'0 18 * * *'
		);
	});

	it('knows a person by an alias', () => {
		expect(createJob({ text: 'x', inMinutes: 5 }, dm('mum'), NOW).owner).toBe('Parent1');
	});

	it('refuses a past time, a bad pattern, a too-fast repeat, and two ways of saying when', () => {
		const make = (when: object) => () => createJob({ text: 'x', ...when }, dm('Parent1'), NOW);
		expect(make({ at: '2026-11-12T08:00' })).toThrow(/has passed/);
		expect(make({ cron: 'every monday' })).toThrow(/not a cron pattern/);
		expect(make({ cron: '* * * * *' })).toThrow(/every 5 minutes/);
		expect(make({ at: '2026-11-12T16:00', inMinutes: 5 })).toThrow(/exactly one/);
		expect(make({})).toThrow(/exactly one/);
		expect(make({ inMinutes: 1e12 })).toThrow(/inMinutes/);
	});

	it('stops at 20 open reminders per person', () => {
		for (let i = 0; i < 20; i++) createJob({ text: `r${i}`, inMinutes: 10 + i }, dm('Kid1'), NOW);
		expect(() => createJob({ text: 'one more', inMinutes: 5 }, dm('Kid1'), NOW)).toThrow(
			/already has 20/
		);
	});
});

describe('listJobs and changes', () => {
	it('shows a DM its own, everyone’s and the ones it made; a group only what is delivered there', () => {
		createJob({ text: 'mine', inMinutes: 30 }, dm('Kid1'), NOW);
		createJob({ text: 'other kid', inMinutes: 20 }, dm('Kid2'), NOW);
		createJob({ text: 'all', inMinutes: 10, for: 'everyone' }, group('Parent1'), NOW);
		createJob({ text: 'for kid2', inMinutes: 40, for: 'Kid2' }, group('Parent1'), NOW);
		expect(listJobs(dm('Kid1')).map((j) => j.text)).toEqual(['all', 'mine']);
		expect(listJobs(group('Kid1')).map((j) => j.text)).toEqual(['all', 'for kid2']);
		expect(listJobs(dm('Parent1')).map((j) => j.text)).toEqual(['all', 'for kid2']);
		expect(() => listJobs(dm('Kid1'), 'Kid2')).toThrow(/only a parent/);
		expect(listJobs(dm('Parent1'), 'Kid2').map((j) => j.text)).toEqual(['other kid', 'for kid2']);
		expect(listJobs(dm('Parent1'), 'all')).toHaveLength(4);
	});

	it('lets the owner, the maker or a parent remove one, and nobody else', () => {
		const job = createJob({ text: 'mine', inMinutes: 30 }, dm('Kid1'), NOW);
		expect(() => removeJob(job.id, dm('Kid2'))).toThrow(/no reminder/);
		expect(() => removeJob(999, dm('Kid1'))).toThrow(/no reminder/);
		expect(removeJob(job.id, dm('Parent1')).text).toBe('mine');
		expect(listJobs(dm('Kid1'))).toEqual([]);
	});

	it('keeps a paused reminder in the list, and resumes a repeat at its next slot', () => {
		const job = createJob({ text: 'Recorder', cron: '15 7 * * 1-5' }, dm('Parent1'), NOW);
		expect(setPaused(job.id, true, dm('Parent1'), NOW).enabled).toBe(false);
		expect(listJobs(dm('Parent1'))).toMatchObject([{ id: job.id, enabled: false }]);
		const later = at('2026-11-20T12:00:00+11:00');
		expect(setPaused(job.id, false, dm('Parent1'), later)).toMatchObject({
			enabled: true,
			nextRunAt: at('2026-11-23T07:15:00+11:00')
		});
	});

	it('moves a one-off to a new time and changes its text', () => {
		const job = createJob({ text: 'Leave', at: '2026-11-12T16:00' }, dm('Kid1'), NOW);
		expect(
			updateJob(job.id, { at: '2026-11-12T17:00', text: 'Leave now' }, dm('Kid1'), NOW)
		).toMatchObject({
			text: 'Leave now',
			nextRunAt: at('2026-11-12T17:00:00+11:00')
		});
		expect(() => updateJob(job.id, {}, dm('Kid1'), NOW)).toThrow(/nothing to change/);
	});

	it('does not let a kid turn a group one-off into a repeat', () => {
		const job = createJob({ text: 'Dinner', inMinutes: 5, for: 'everyone' }, group('Kid1'), NOW);
		expect(() => updateJob(job.id, { cron: '0 18 * * *' }, dm('Kid1'), NOW)).toThrow(
			/only a parent/
		);
	});
});

describe('dispatchDue', () => {
	const row = (id: number) =>
		sqlite.prepare('SELECT * FROM user_job WHERE id = ?').get(id) as
			Record<string, unknown> | undefined;
	const ok = () => vi.fn().mockResolvedValue(undefined);
	const down = () => vi.fn().mockRejectedValue(new Error('whatsapp is not connected'));

	it('sends a due one-off once, records it in the chat, and removes it', async () => {
		const job = createJob({ text: 'Leave', inMinutes: 5 }, dm('Kid1'), NOW);
		const send = ok();
		expect(await dispatchDue(send, at('2026-11-12T09:04:00+11:00'))).toEqual({
			sent: 0,
			waiting: 0
		});
		expect(await dispatchDue(send, at('2026-11-12T09:05:10+11:00'))).toEqual({
			sent: 1,
			waiting: 0
		});
		expect(send).toHaveBeenCalledWith('whatsapp', 'wa:Kid1', '⏰ Leave');
		expect(recordSent).toHaveBeenCalledWith('person:Kid1/main', '⏰ Leave', 'whatsapp');
		expect(row(job.id)).toBeUndefined();
		expect(await dispatchDue(send, at('2026-11-12T09:06:00+11:00'))).toEqual({
			sent: 0,
			waiting: 0
		});
		expect(send).toHaveBeenCalledTimes(1);
	});

	it('moves a repeat to its next slot', async () => {
		const job = createJob({ text: 'Recorder', cron: '15 7 * * 1-5' }, dm('Parent1'), NOW);
		await dispatchDue(ok(), at('2026-11-13T07:15:05+11:00'));
		expect(row(job.id)).toMatchObject({
			enabled: 1,
			next_run_at: at('2026-11-16T07:15:00+11:00').getTime()
		});
	});

	it('leaves a paused reminder alone', async () => {
		const job = createJob({ text: 'Leave', inMinutes: 5 }, dm('Kid1'), NOW);
		setPaused(job.id, true, dm('Kid1'), NOW);
		expect(await dispatchDue(ok(), at('2026-11-12T10:00:00+11:00'))).toEqual({
			sent: 0,
			waiting: 0
		});
	});

	it('names the person in a shared chat, and says when it is late', async () => {
		createJob({ text: 'Leave', at: '2026-11-12T16:00', for: 'Kid1' }, group('Parent1'), NOW);
		const send = ok();
		await dispatchDue(send, at('2026-11-12T16:30:00+11:00'));
		expect(send.mock.calls[0][2]).toBe('⏰ Kid1: Leave (late: was for 16:00)');
	});

	it('reports a reminder over 12 hours late as missed, without dropping it', async () => {
		createJob({ text: 'Leave', at: '2026-11-12T16:00' }, dm('Kid1'), NOW);
		const send = ok();
		await dispatchDue(send, at('2026-11-13T08:00:00+11:00'));
		expect(send.mock.calls[0][2]).toBe('⏰ I missed a reminder set for 2026-11-12 16:00: Leave');
	});

	it('retries a failed send on a backoff, keeps the slot, and sends it marked late', async () => {
		const job = createJob({ text: 'Leave', at: '2026-11-12T16:00' }, dm('Kid1'), NOW);
		const t = at('2026-11-12T16:00:00+11:00');
		expect(await dispatchDue(down(), t)).toEqual({ sent: 0, waiting: 1 });
		expect(row(job.id)).toMatchObject({
			enabled: 1,
			error_count: 1,
			last_error: 'whatsapp is not connected',
			next_run_at: t.getTime(),
			retry_at: t.getTime() + 30_000
		});
		expect(recordSent).not.toHaveBeenCalled();
		// Not tried again inside the backoff.
		const send = ok();
		expect(await dispatchDue(send, new Date(t.getTime() + 10_000))).toEqual({
			sent: 0,
			waiting: 0
		});
		expect(await dispatchDue(send, new Date(t.getTime() + 7 * 60_000))).toEqual({
			sent: 1,
			waiting: 0
		});
		expect(send.mock.calls[0][2]).toBe('⏰ Leave (late: was for 16:00)');
	});

	it('retries a failed repeat the same day, not at its next slot', async () => {
		const job = createJob({ text: 'Recorder', cron: '15 7 * * 1-5' }, dm('Parent1'), NOW);
		const t = at('2026-11-13T07:15:00+11:00');
		await dispatchDue(down(), t);
		const send = ok();
		expect(await dispatchDue(send, new Date(t.getTime() + 60_000))).toEqual({
			sent: 1,
			waiting: 0
		});
		expect(send.mock.calls[0][2]).toBe('⏰ Recorder');
		expect(row(job.id)).toMatchObject({ error_count: 0, retry_at: null });
	});

	it('tells a parent after 5 failures, keeps trying, and says when it got through', async () => {
		const job = createJob({ text: 'Leave', inMinutes: 5 }, dm('Kid1'), NOW);
		let t = at('2026-11-12T09:05:00+11:00');
		for (let i = 0; i < 6; i++) {
			await dispatchDue(down(), t);
			t = new Date(t.getTime() + 61 * 60_000);
		}
		expect(row(job.id)).toMatchObject({ enabled: 1, error_count: 6 });
		expect(raiseAlert).toHaveBeenCalledTimes(2);
		expect(raiseAlert.mock.calls[0][0]).toBe(`user-job:${job.id}`);
		expect(await dispatchDue(ok(), t)).toEqual({ sent: 1, waiting: 0 });
		expect(clearAlert).toHaveBeenCalledWith(`user-job:${job.id}`, expect.anything());
	});

	it('counts a send that never settles as failed', async () => {
		vi.useFakeTimers();
		try {
			createJob({ text: 'Leave', inMinutes: 5 }, dm('Kid1'), NOW);
			const run = dispatchDue(() => new Promise(() => {}), at('2026-11-12T09:05:00+11:00'));
			await vi.advanceTimersByTimeAsync(31_000);
			expect(await run).toEqual({ sent: 0, waiting: 1 });
		} finally {
			vi.useRealTimers();
		}
	});
});
