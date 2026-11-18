import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
const { forKid, parseSentralCalendar, yearsNamed } = await import('./sentral-calendar.ts');

// The portal's shape: date → that day's events. Invented titles; the real calendar names the school.
const raw = {
	events: {
		'2026-12-10': [
			{ id: 390, title: 'Year 9 Camp ', recurring: true, date: { date: '2026-12-01 00:00:00' } },
			{ id: 9027, title: 'Year 9 Camp 2026', start_time_hour: '08', start_time_minute: '00' }
		],
		'2026-12-09': [
			{ id: 390, title: 'Year 9 Camp ' },
			{ id: 9027, title: 'Year 9 Camp 2026', start_time_hour: '08', start_time_minute: '00' },
			{ id: 5, title: 'Futsal  Championships', start_time_hour: '8', start_time_minute: '30' }
		],
		'2026-12-11': [{ id: 390, title: 'Year 9 Camp' }],
		'2026-12-02': [{ id: 9116, title: 'Tentative date: Yr 7 Swim Survive' }],
		'2026-12-03': [{ id: 9451, title: 'Orientation Day Year 7 2027 Performance' }],
		'2026-12-04': [{ id: 12, title: '' }, { title: 'no id' }]
	}
};

describe('parseSentralCalendar', () => {
	const events = parseSentralCalendar(raw);

	it('makes one event per id, from its first day to its last, by the map key', () => {
		expect(events.find((e) => e.id === 390)).toEqual({
			id: 390,
			title: 'Year 9 Camp',
			from: '2026-12-09',
			to: '2026-12-11'
		});
	});

	it('reads the start time from the hour and minute fields', () => {
		expect(events.find((e) => e.id === 5)).toMatchObject({
			time: '08:30',
			title: 'Futsal Championships'
		});
	});

	it('skips events with no id or title, and refuses a reply with no events map', () => {
		expect(events.map((e) => e.id)).toEqual([9116, 9451, 5, 390, 9027]);
		expect(() => parseSentralCalendar('<html>')).toThrow();
	});

	it('caps a title at 80 characters', () => {
		const long = parseSentralCalendar({
			events: { '2026-12-01': [{ id: 1, title: 'x'.repeat(200) }] }
		});
		expect(long[0].title).toHaveLength(80);
	});
});

describe('yearsNamed', () => {
	it.each([
		['Year 9 Camp', [9]],
		['Tentative date: Yr7 Swim Survive', [7]],
		['YEAR 10 RECOGNITION CEREMONY', [10]],
		['Year 10-11 Transition Excursion', [10, 11]],
		['Years 7 and 8 sport', [7, 8]],
		['Orientation Day Year 7 2027 Performance', []],
		['Year 12 2026 Formal', [12]],
		['Year 7-8 2027 Orientation', []],
		['Futsal Championships', []],
		['Under 15s Waterpolo', []]
	])('%s → %j', (title, years) => expect(yearsNamed(title, 2026)).toEqual(years));
});

describe('forKid', () => {
	const events = parseSentralCalendar(raw);

	it("keeps the events naming the kid's year, merging a banner and its detail", () => {
		expect(forKid(events, 9, '2026-12-01', 21).map((e) => e.id)).toEqual([390]);
		expect(forKid(events, 7, '2026-12-01', 21).map((e) => e.id)).toEqual([9116]);
	});

	it('keeps an event still running and drops one past the window', () => {
		expect(forKid(events, 9, '2026-12-10', 0).map((e) => e.id)).toEqual([390]);
		expect(forKid(events, 9, '2026-11-01', 7)).toEqual([]);
	});
});
