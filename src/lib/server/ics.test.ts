import { describe, expect, it } from 'vitest';
import { parseIcsDays } from './ics';

describe('parseIcsDays', () => {
	it('reads all-day and Sydney-midnight timed events as inclusive Sydney days', () => {
		// The NSW feed mixes VALUE=DATE events with a few timed at Sydney midnight.
		const feed = [
			'BEGIN:VCALENDAR',
			'BEGIN:VEVENT',
			'UID:a',
			'DTSTART;VALUE=DATE:20260928',
			'DTEND;VALUE=DATE:20261010',
			'SUMMARY:School Holidays',
			'END:VEVENT',
			'BEGIN:VEVENT',
			'UID:b',
			'DTSTART;TZID=Australia/Sydney:20260405T000000',
			'DTEND;TZID=Australia/Sydney:20260406T000000',
			'SUMMARY;LANGUAGE=en-us:Easter Sunday',
			'END:VEVENT',
			'END:VCALENDAR'
		].join('\r\n');
		expect(parseIcsDays(feed)).toEqual([
			{ title: 'School Holidays', start: '2026-09-28', end: '2026-10-09' },
			{ title: 'Easter Sunday', start: '2026-04-05', end: '2026-04-05' }
		]);
	});
});
