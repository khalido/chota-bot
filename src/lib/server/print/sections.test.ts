/**
 * The data → PrintSection[] → text pipeline, end to end.
 *
 * `gatherBrief` (the I/O) isn't exercised here — we hand-build a representative
 * `BriefData` + `SchedulePeriod[]` and run it through `recipientToSections` /
 * `sectionsToText`. So this catches: a broken section builder, a section kind
 * missing from `sectionsToText`'s switch (which fails silently), the name
 * masthead, the kid's school+bus block, and any unintended change to the ASCII
 * layout. Pure + deterministic (fixed Dates, Sydney TZ). May 2026 = AEST (+10:00).
 *
 * Names + activities here are PLACEHOLDERS — real family data lives only in
 * the gitignored `chota.config.ts`. If you change the layout on purpose:
 * `npm run test:unit -- --run -u`, then eyeball the snapshot diff.
 */
import { describe, it, expect } from 'vitest';
import { recipientToSections, sectionsToText } from './sections';
import type { BriefData } from './brief';
import type { CalendarEvent } from '$lib/server/tools/calendar';
import type { FamilyMember } from '$lib/config';
import type { SchedulePeriod } from '$lib/server/tools/sentral';

const FAMILY: FamilyMember[] = [
	{ name: 'Parent1', aliases: ['Parent1', 'P1'] },
	{ name: 'Kid1', aliases: ['Kid1'] },
	{ name: 'Kid2', aliases: ['Kid2'] }
];

const EVENTS: CalendarEvent[] = [
	{
		id: 'e1',
		summary: 'Drop car for service',
		start: new Date('2026-05-12T22:30:00Z'),
		end: new Date('2026-05-12T23:00:00Z'),
		isAllDay: false
	},
	{
		id: 'e2',
		summary: 'Kid1 lesson',
		start: new Date('2026-05-13T05:30:00Z'),
		end: new Date('2026-05-13T06:15:00Z'),
		isAllDay: false
	},
	{
		id: 'e3',
		summary: 'Bin night',
		start: new Date('2026-05-12T14:00:00Z'),
		end: new Date('2026-05-13T14:00:00Z'),
		isAllDay: true
	}
];

const DATA: BriefData = {
	now: new Date('2026-05-13T20:45:00Z'), // not used by the renderers; just satisfies the type
	date: 'Wednesday 13 May',
	weatherLines: [
		'[ PARTLY SUNNY ]  18C now (feels 22C)',
		'rain 1-3pm  ::##::',
		'-> 17-19C today, wind 12km/h',
		'-> tmrw: light rain, 14-16C'
	],
	weatherIcon: 'cloud-sun',
	events: EVENTS,
	family: FAMILY,
	schoolBus: [{ kids: ['Kid1', 'Kid2'], line: '501 at 7:35am, 7:45am, 7:55am' }],
	chores: [
		{ person: 'Kid1', chores: ['Walk and feed the dog'] },
		{ person: 'Kid2', chores: ['Empty + load the dishwasher'] }
	],
	dueSoon: [
		{ list: 'Read', items: [{ title: 'The Hobbit', when: 'tmrw' }] },
		{ list: 'Watch', items: [{ title: 'Dune', when: 'today' }] }
	],
	puzzle: {
		q: 'A 3x3x3 cube is painted red, then cut into 27 small cubes. How many have NO red face?',
		a: '1 — the centre cube.'
	},
	shoppingItems: ['Choc', 'Hot Choc Powder (Cadbury)', 'Coriander', 'Salt for the salt grinder'],
	fact: {
		text: 'Earth is the only planet in the solar system not named after a Greek or Roman god.'
	},
	closing: 'Have a good day, kids -- Chota'
};

const KID1_SCHEDULE: SchedulePeriod[] = [
	{
		start: new Date('2026-05-12T22:50:00Z'), // 08:50 Sydney
		end: new Date('2026-05-12T23:50:00Z'), // 09:50 Sydney
		summary: '7CRE&: Creativity Yr7',
		subject: 'Creativity Yr7',
		code: '7CRE&',
		room: '1D.02',
		teacher: 'Ms Example Teacher',
		period: 1
	},
	{
		start: new Date('2026-05-13T00:45:00Z'), // 10:45 Sydney
		end: new Date('2026-05-13T01:45:00Z'), // 11:45 Sydney
		summary: 'SSVOLLEY3: Social Volleyball 3 Sport',
		subject: 'SOCIAL VOLLEYBALL 3 SPORT',
		code: 'SSVOLLEY3',
		room: '3D.04',
		teacher: 'Mr Sample Staff',
		period: 2
	}
];

describe('print pipeline', () => {
	it('kid brief — name masthead, school section with code/teacher/room + bus + sport reminder', () => {
		const text = sectionsToText(
			DATA.date,
			recipientToSections('kid1', DATA, KID1_SCHEDULE),
			DATA.closing,
			'Kid1'
		);
		expect(text).toMatchInlineSnapshot(`
			"Wednesday 13 May                          Kid1

			01 WEATHER
			[ PARTLY SUNNY ]  18C now (feels 22C)
			rain 1-3pm  ::##::
			-> 17-19C today, wind 12km/h
			-> tmrw: light rain, 14-16C

			02 SCHOOL
			Creativity Yr7  8:50-9:50am  1D.02
			  with Ms E. Teacher (7CRE&)
			SOCIAL VOLLEYBALL 3 SPORT  10:45-11:45am  3D.04
			  with Mr S. Staff (SSVOLLEY3)
			  -> Take sports stuff!
			  501 at 7:35am, 7:45am, 7:55am

			03 TODAY
			8:30-9am     Drop car for service
			3:30-4:15pm  Kid1 lesson  (Kid1)
			all day      Bin night

			04 CHORES
			Kid1: Walk and feed the dog
			Kid2: Empty + load the dishwasher

			05 TICKTICK
			Shopping:
			Choc, Hot Choc Powder, Coriander,
			Salt for the salt g…

			Read: "The Hobbit" (tmrw)
			Watch: "Dune" (today)

			06 PUZZLE
			A 3x3x3 cube is painted red, then cut into 27 small cubes. How many have NO red face?

			07 DID YOU KNOW
			Earth is the only planet in the solar system not named after a Greek or Roman god.

			Have a good day, kids -- Chota"
		`);
	});

	it('person with no school timetable — household sections + name masthead', () => {
		const text = sectionsToText(
			DATA.date,
			recipientToSections('parent1', DATA, []),
			DATA.closing,
			'Parent1'
		);
		expect(text).toMatchInlineSnapshot(`
			"Wednesday 13 May                       Parent1

			01 WEATHER
			[ PARTLY SUNNY ]  18C now (feels 22C)
			rain 1-3pm  ::##::
			-> 17-19C today, wind 12km/h
			-> tmrw: light rain, 14-16C

			02 TODAY
			8:30-9am     Drop car for service
			3:30-4:15pm  Kid1 lesson  (Kid1)
			all day      Bin night

			03 CHORES
			Kid1: Walk and feed the dog
			Kid2: Empty + load the dishwasher

			04 TICKTICK
			Shopping:
			Choc, Hot Choc Powder, Coriander,
			Salt for the salt g…

			Read: "The Hobbit" (tmrw)
			Watch: "Dune" (today)

			05 PUZZLE
			A 3x3x3 cube is painted red, then cut into 27 small cubes. How many have NO red face?

			06 DID YOU KNOW
			Earth is the only planet in the solar system not named after a Greek or Roman god.

			Have a good day, kids -- Chota"
		`);
	});
});
