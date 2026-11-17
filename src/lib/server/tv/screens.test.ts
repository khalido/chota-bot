import { describe, expect, it, vi } from 'vitest';
import { Screen, type Block } from '../../../../cast/src/protocol/schema.ts';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));

const { buildScreens, dayEvents } = await import('./screens');
const { chatScreen } = await import('#lib/server/agent/tools/tv.ts');

// 07:30 on Tue 17 Nov 2026 in Sydney.
const now = new Date('2026-11-16T20:30:00Z');
const at = (iso: string) => new Date(iso);
const dep = (route: string, iso: string, realtime = true, cancelled = false) => ({
	route,
	destination: 'City',
	dueMins: 0,
	realtime,
	cancelled,
	scheduledAt: at(iso),
	estimatedAt: at(iso)
});

const data = {
	trips: [
		{
			kids: ['Kid1', 'Kid2'],
			trip: { label: 'school', stop: '1', routes: ['501', 'M50'] },
			departures: [
				dep('501', '2026-11-16T20:20:00Z'),
				dep('501', '2026-11-16T20:41:00Z'),
				dep('M50', '2026-11-16T20:45:00Z', false, true)
			]
		}
	],
	weather: {
		tempC: 18.4,
		feelsLikeC: 17.6,
		condition: 'Partly cloudy',
		humidityPct: 60,
		windKmh: 10,
		uvIndex: 3,
		hourly: [
			{
				at: at('2026-11-16T20:00:00Z'),
				tempC: 18,
				condition: 'Cloudy',
				rainPct: 0,
				rainMm: 0,
				windKmh: 8
			},
			{
				at: at('2026-11-16T21:00:00Z'),
				tempC: 19,
				condition: 'Cloudy',
				rainPct: 10,
				rainMm: 0,
				windKmh: 9
			}
		]
	},
	evening: false,
	day: '2026-11-17',
	headline: 'Mild, dry morning',
	events: [
		{
			id: 'a',
			summary: 'Swim k1',
			start: at('2026-11-17T05:00:00Z'),
			end: at('2026-11-17T06:00:00Z'),
			isAllDay: false,
			location: 'Pool'
		},
		{
			id: 'b',
			summary: 'School concert',
			start: at('2026-11-16T13:00:00Z'),
			end: at('2026-11-17T13:00:00Z'),
			isAllDay: true
		},
		{
			id: 'c',
			summary: 'Dentist',
			start: at('2026-11-18T23:00:00Z'),
			end: at('2026-11-18T23:30:00Z'),
			isAllDay: false
		}
	],
	chores: [{ person: 'Kid1', chores: ['Dishes', 'Bins'] }],
	school: [
		{
			kid: 'Kid1',
			periods: [
				{
					start: at('2026-11-16T21:50:00Z'),
					end: at('2026-11-16T22:50:00Z'),
					summary: 'Maths',
					subject: 'Maths'
				},
				{
					start: at('2026-11-17T03:10:00Z'),
					end: at('2026-11-17T04:10:00Z'),
					summary: 'Sport',
					subject: 'Sport'
				}
			]
		}
	],
	schoolWeek: { term: 4, week: 6 },
	family: [{ name: 'Kid1', role: 'kid' as const, aliases: ['k1'] }],
	quote: { kind: 'tv', quote: 'Wackadoo!', speaker: 'Bandit', title: 'Bluey' },
	home: {
		summary: 'The AC is off. Nothing playing.',
		windows: { advice: 'open' as const, why: 'cooler outside', insideC: 23.46, outsideC: 18 }
	}
};

describe('buildScreens', () => {
	const screens = buildScreens(data, now);

	it('makes Today, Week and Home, each one the receiver accepts', () => {
		expect(screens.map((s) => s.id)).toEqual(['today', 'week', 'home']);
		for (const s of screens) expect(Screen.safeParse(s).error).toBeUndefined();
	});

	it("leads Today with today's events, then clock, weather, buses, school and chores", () => {
		const today = screens[0].blocks!;
		expect(today.map((b) => b.type)).toEqual([
			'calendar-day',
			'clock',
			'weather',
			'bus',
			'list',
			'list'
		]);
		const cal = today[0] as Extract<(typeof today)[number], { type: 'calendar-day' }>;
		expect(cal.events.map((e) => e.title)).toEqual(['School concert', 'Swim k1']);
		expect(cal.events[1].who).toBe('Kid1');
		expect(cal.events[0].start).toBeUndefined(); // all-day first, no time
	});

	it("shows the day's quote in school's cell when there's no school", () => {
		const out = buildScreens({ ...data, school: [] }, now)[0].blocks!;
		expect(out.at(-1)).toMatchObject({ title: 'Quote', text: '“Wackadoo!”\n\n— Bandit, *Bluey*' });
	});

	it("gives each kid one school line: the day's hours and the sports nudge", () => {
		expect(screens[0].blocks![5]).toEqual({
			type: 'list',
			title: 'School · T4 Wk6',
			items: [{ id: 'school:Kid1', text: '8:50am-3:10pm · Take sports stuff!', meta: 'Kid1' }]
		});
	});

	it("shows tomorrow's events under Tomorrow in the evening", () => {
		const cal = buildScreens({ ...data, evening: true, day: '2026-11-18' }, now)[0].blocks![0];
		expect(cal).toMatchObject({ title: 'Tomorrow', events: [] });
		const thu = buildScreens({ ...data, evening: true, day: '2026-11-19' }, now)[0].blocks![0];
		expect(thu).toMatchObject({ title: 'Tomorrow', events: [{ title: 'Dentist' }] });
	});

	it('keeps the hero to six timed events, dropping finished ones first', () => {
		const hour = (h: number) => ({
			id: `e${h}`,
			summary: `Event ${h}`,
			start: at(`2026-11-17T${String(h - 11).padStart(2, '0')}:00:00Z`),
			end: at(`2026-11-17T${String(h - 11).padStart(2, '0')}:30:00Z`),
			isAllDay: false
		});
		const events = [13, 14, 15, 16, 17, 18, 19, 20, 21].map(hour); // Sydney hours, 1pm–9pm
		const at4pm = new Date('2026-11-17T05:45:00Z'); // 16:45 Sydney: 1, 2, 3 and 4pm are over
		expect(dayEvents({ events, day: '2026-11-17' }, at4pm).map((e) => e.id)).toEqual([
			'e16',
			'e17',
			'e18',
			'e19',
			'e20',
			'e21'
		]);
	});

	it('shows only buses still to come, one row per route', () => {
		const bus = screens[0].blocks!.find((b) => b.type === 'bus')!;
		expect(bus).toMatchObject({
			routes: [
				{
					route: '501',
					to: 'school · Kid1, Kid2',
					departures: [{ at: '2026-11-16T20:41:00.000Z' }]
				},
				{ route: 'M50', departures: [{ cancelled: true, realtime: false }] }
			]
		});
	});

	it('shows the next seven Sydney days in one week block, empty days included', () => {
		const block = screens[1].blocks![0] as Extract<Block, { type: 'week' }>;
		expect(block.days.map((d) => d.date)).toEqual([
			'2026-11-17',
			'2026-11-18',
			'2026-11-19',
			'2026-11-20',
			'2026-11-21',
			'2026-11-22',
			'2026-11-23'
		]);
		expect(block.days.map((d) => d.events.length)).toEqual([2, 0, 1, 0, 0, 0, 0]);
	});

	it('leaves Home out when the house is not connected, and adds a chat screen last', () => {
		const chat = chatScreen({ title: 'Shopping', items: [{ text: 'Milk' }] });
		const out = buildScreens(
			{ ...data, home: null, chores: [], trips: [], quote: null, school: [] },
			now,
			[chat]
		);
		expect(out.map((s) => s.id)).toEqual(['today', 'week', 'chat']);
		expect(out[0].blocks!.map((b) => b.type)).toEqual(['calendar-day', 'clock', 'weather']);
		for (const s of out) expect(Screen.safeParse(s).error).toBeUndefined();
	});

	it('moves a long note under a photo into its own block, so the receiver takes it', () => {
		const long = chatScreen({
			title: 'Photo',
			image: 'https://example.com/a.jpg',
			text: 'x'.repeat(400)
		});
		expect(long.blocks!.map((b) => b.type)).toEqual(['image', 'text']);
		expect(Screen.safeParse(long).error).toBeUndefined();
		const short = chatScreen({
			title: 'Photo',
			image: 'https://example.com/a.jpg',
			text: 'Beach day'
		});
		expect(short.blocks).toMatchObject([{ type: 'image', caption: 'Beach day' }]);
	});
});
