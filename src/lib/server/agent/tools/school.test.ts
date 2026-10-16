import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolTerm } from '$lib/server/tools/schoolterms';

const terms2026: SchoolTerm[] = [
	{ term: 1, start: '2026-02-02', end: '2026-04-02' },
	{ term: 2, start: '2026-04-22', end: '2026-07-03' },
	{ term: 3, start: '2026-07-21', end: '2026-09-25' },
	{ term: 4, start: '2026-10-13', end: '2026-12-17' }
];
const terms2027: SchoolTerm[] = [{ term: 1, start: '2027-02-03', end: '2027-04-09' }];

const st = vi.hoisted(() => ({
	week: null as { term: number; week: number } | null,
	brk: null as { until: string; resumes: string } | null,
	upcoming: [] as { label: string; start: string; end: string }[]
}));

vi.mock('$lib/server/tools/sentral', () => ({
	configuredSentralKids: () => [],
	getSchedule: vi.fn()
}));
vi.mock('$lib/server/tools/schoolterms', () => ({
	getSchoolTerms: async (year: number) => (year === 2026 ? terms2026 : terms2027),
	getSchoolWeek: async () => st.week,
	getSchoolBreak: async () => st.brk,
	getUpcomingSchoolEvents: async () => st.upcoming
}));
vi.mock('$lib/server/log', () => ({ errorMessage: (e: unknown) => String(e), logErr: vi.fn() }));

const { schoolDatesTool } = await import('./school');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = () => (schoolDatesTool as any).execute({}, {});

beforeEach(() => {
	st.week = null;
	st.brk = null;
	st.upcoming = [];
});
afterEach(() => vi.useRealTimers());

describe('school_dates', () => {
	it('in term: last day, days to go, the holidays spelled out, and next year late in the year', async () => {
		vi.useFakeTimers({ now: new Date('2026-10-16T09:00:00+11:00') });
		st.week = { term: 4, week: 1 };
		st.upcoming = [{ label: 'Summer holidays', start: '2026-12-18', end: '2027-01-27' }];
		const r = await run();
		expect(r.now).toEqual({ term: 4, week: 1, lastDay: '2026-12-17', daysToLastDay: 62 });
		expect(r.nextHolidays).toEqual({
			name: 'Summer holidays',
			firstDayOfHolidays: '2026-12-18',
			lastDayOfHolidays: '2027-01-27',
			backAtSchool: '2027-02-03'
		});
		expect(r.nextTermStarts).toBe('2027-02-03');
	});

	it('in the holidays: when they end and when school is back', async () => {
		vi.useFakeTimers({ now: new Date('2026-07-10T09:00:00+10:00') });
		st.brk = { until: '2026-07-19', resumes: '2026-07-21' };
		const r = await run();
		expect(r.now).toEqual({
			holidays: true,
			lastDayOfHolidays: '2026-07-19',
			backOn: '2026-07-21'
		});
		expect(r.nextTermStarts).toBe('2026-07-21');
	});

	it('mid-year: no next-year lookup', async () => {
		vi.useFakeTimers({ now: new Date('2026-05-04T09:00:00+10:00') });
		st.week = { term: 2, week: 2 };
		const r = await run();
		expect(r.now.lastDay).toBe('2026-07-03');
		expect(r.nextTermStarts).toBe('2026-07-21');
		expect(r.nextHolidays).toBeNull();
	});
});
