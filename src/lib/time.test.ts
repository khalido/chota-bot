import { describe, it, expect } from 'vitest';
import {
	sydneyDateShort,
	sydneyDayOfWeek,
	sydneyHHMM,
	sydneyHour,
	sydneyOffset,
	sydneyTimeCompact,
	sydneyTimeOnDay,
	sydneyTimeRange,
	sydneyYMD
} from './time';

describe('sydneyHHMM', () => {
	it('formats Sydney local time in 24h HH:MM', () => {
		// 9 May 2026 22:00 UTC = 10 May 08:00 Sydney AEST (+10)
		expect(sydneyHHMM(new Date('2026-05-09T22:00:00Z'))).toBe('08:00');
	});

	it('handles AEDT (DST, +11) correctly', () => {
		// 9 Dec 2026 21:00 UTC = 10 Dec 08:00 Sydney AEDT (+11)
		expect(sydneyHHMM(new Date('2026-12-09T21:00:00Z'))).toBe('08:00');
	});
});

describe('sydneyHour', () => {
	it('returns 0-23', () => {
		expect(sydneyHour(new Date('2026-05-09T00:00:00Z'))).toBe(10); // AEST
		expect(sydneyHour(new Date('2026-05-09T22:00:00Z'))).toBe(8);
	});
});

describe('sydneyYMD', () => {
	it('uses Sydney calendar date, not UTC', () => {
		// 9 May 22:00 UTC = 10 May 08:00 Sydney → date is 10
		expect(sydneyYMD(new Date('2026-05-09T22:00:00Z'))).toBe('2026-05-10');
	});
});

describe('sydneyDayOfWeek', () => {
	it('returns short weekday in Sydney local', () => {
		// 9 May 2026 = Saturday
		expect(sydneyDayOfWeek(new Date('2026-05-09T05:00:00Z'))).toBe('Sat');
	});

	it('respects Sydney date boundary', () => {
		// 9 May 14:01 UTC = 10 May 00:01 Sydney → Sunday
		expect(sydneyDayOfWeek(new Date('2026-05-09T14:01:00Z'))).toBe('Sun');
	});
});

describe('sydneyDateShort', () => {
	it('formats with weekday + ordinal day + month', () => {
		expect(sydneyDateShort(new Date('2026-05-09T05:00:00Z'))).toBe('Sat 9th May');
	});

	it.each([
		['2026-05-01T05:00:00Z', '1st'],
		['2026-05-02T05:00:00Z', '2nd'],
		['2026-05-03T05:00:00Z', '3rd'],
		['2026-05-04T05:00:00Z', '4th'],
		['2026-05-11T05:00:00Z', '11th'],
		['2026-05-12T05:00:00Z', '12th'],
		['2026-05-13T05:00:00Z', '13th'],
		['2026-05-21T05:00:00Z', '21st'],
		['2026-05-22T05:00:00Z', '22nd'],
		['2026-05-23T05:00:00Z', '23rd'],
		['2026-05-31T05:00:00Z', '31st']
	])('renders correct ordinal for %s', (iso, expected) => {
		expect(sydneyDateShort(new Date(iso))).toContain(expected);
	});
});

describe('sydneyOffset', () => {
	it('returns +10:00 in AEST (May)', () => {
		expect(sydneyOffset(new Date('2026-05-09T00:00:00Z'))).toBe('+10:00');
	});

	it('returns +11:00 in AEDT (December)', () => {
		expect(sydneyOffset(new Date('2026-12-09T00:00:00Z'))).toBe('+11:00');
	});
});

describe('sydneyTimeCompact', () => {
	it('drops :00 minutes and uses no space', () => {
		// 9 May 06:00 UTC = 9 May 16:00 Sydney = 4pm
		expect(sydneyTimeCompact(new Date('2026-05-09T06:00:00Z'))).toBe('4pm');
	});

	it('keeps minutes when not :00', () => {
		// 9 May 07:30 UTC = 9 May 17:30 Sydney = 5:30pm
		expect(sydneyTimeCompact(new Date('2026-05-09T07:30:00Z'))).toBe('5:30pm');
	});

	it('renders midnight as 12am', () => {
		// 8 May 14:00 UTC = 9 May 00:00 Sydney = 12am
		expect(sydneyTimeCompact(new Date('2026-05-08T14:00:00Z'))).toBe('12am');
	});

	it('renders noon as 12pm', () => {
		// 9 May 02:00 UTC = 9 May 12:00 Sydney = 12pm
		expect(sydneyTimeCompact(new Date('2026-05-09T02:00:00Z'))).toBe('12pm');
	});
});

describe('sydneyTimeRange', () => {
	it('collapses shared pm suffix', () => {
		// 4pm to 5:15pm in Sydney
		const start = new Date('2026-05-09T06:00:00Z');
		const end = new Date('2026-05-09T07:15:00Z');
		expect(sydneyTimeRange(start, end)).toBe('4-5:15pm');
	});

	it('keeps both suffixes when am/pm differ', () => {
		// 11am to 1:30pm in Sydney
		const start = new Date('2026-05-09T01:00:00Z');
		const end = new Date('2026-05-09T03:30:00Z');
		expect(sydneyTimeRange(start, end)).toBe('11am-1:30pm');
	});

	it('returns just the start when end <= start (zero-length event)', () => {
		const t = new Date('2026-05-09T06:00:00Z');
		expect(sydneyTimeRange(t, t)).toBe('4pm');
	});
});

describe('sydneyTimeOnDay', () => {
	it('builds 08:00 Sydney as a UTC Date in AEST', () => {
		const anchor = new Date('2026-05-09T00:00:00Z'); // 9 May 10:00 Sydney
		const target = sydneyTimeOnDay('08:00', anchor);
		// 9 May 08:00 AEST = 8 May 22:00 UTC
		expect(target.toISOString()).toBe('2026-05-08T22:00:00.000Z');
	});

	it('builds 08:00 Sydney as a UTC Date in AEDT (DST)', () => {
		const anchor = new Date('2026-12-09T00:00:00Z'); // 9 Dec 11:00 Sydney
		const target = sydneyTimeOnDay('08:00', anchor);
		// 9 Dec 08:00 AEDT = 8 Dec 21:00 UTC
		expect(target.toISOString()).toBe('2026-12-08T21:00:00.000Z');
	});
});
