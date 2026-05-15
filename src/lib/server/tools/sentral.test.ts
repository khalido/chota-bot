import { describe, it, expect } from 'vitest';
import { parseIcsEvents } from './sentral';

// Sentral exports all-UTC `DTSTART:...Z`; SUMMARY carries a subject code prefix.
const SAMPLE = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0',
	'PRODID:-//Sabre//Sabre VObject 4.5.8//EN',
	'BEGIN:VEVENT',
	'DTSTART:20260421T225000Z',
	'DTSTAMP:20260511T214340Z',
	'DTEND:20260421T235500Z',
	'UID:abc@sentral.local',
	'DESCRIPTION:Teacher: Ms Example Teacher\\nPeriod: 1',
	'SUMMARY:7CRE&: Creativity Yr7',
	'LOCATION:Room: 1D.02',
	'END:VEVENT',
	'BEGIN:VEVENT',
	'DTSTART:20260422T010500Z',
	'DTEND:20260422T020500Z',
	'UID:def@sentral.local',
	'DESCRIPTION:Teacher: Mr Sample Staff\\nPeriod: 3',
	'SUMMARY:7SCIO: Science Yr7',
	'LOCATION:Room: 1J.04',
	'END:VEVENT',
	'END:VCALENDAR'
].join('\r\n');

describe('parseIcsEvents', () => {
	it('parses VEVENTs with UTC times, summary, location, description', () => {
		const events = parseIcsEvents(SAMPLE);
		expect(events).toHaveLength(2);
		expect(events[0].start.toISOString()).toBe('2026-04-21T22:50:00.000Z');
		expect(events[0].end.toISOString()).toBe('2026-04-21T23:55:00.000Z');
		expect(events[0].summary).toBe('7CRE&: Creativity Yr7');
		expect(events[0].location).toBe('Room: 1D.02');
		expect(events[0].description).toContain('Teacher: Ms Example Teacher');
		expect(events[0].description).toContain('\n'); // \\n in the .ics → real newline
	});

	it('unfolds RFC 5545 line continuations (CRLF + leading WSP removed, no space inserted)', () => {
		const folded = [
			'BEGIN:VEVENT',
			'DTSTART:20260101T000000Z',
			'DTEND:20260101T010000Z',
			'SUMMARY:Creativity Yr7 Sub',
			' ject Continued',
			'END:VEVENT'
		].join('\r\n');
		const [e] = parseIcsEvents(folded);
		expect(e.summary).toBe('Creativity Yr7 Subject Continued');
	});

	it('skips VEVENTs missing required fields', () => {
		const partial = ['BEGIN:VEVENT', 'UID:x', 'END:VEVENT'].join('\r\n');
		expect(parseIcsEvents(partial)).toHaveLength(0);
	});
});
