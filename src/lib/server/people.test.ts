import { describe, it, expect } from 'vitest';
import { parseEventPeople } from './people';
import type { FamilyMember } from '$lib/config';

// Placeholder family — real names live only in the gitignored chota.config.ts.
// These exist purely to exercise the matcher (token boundaries, initials,
// nicknames, separators) so any plausible alias shape is covered.
const FAMILY: FamilyMember[] = [
	{ name: 'Parent1', aliases: ['Parent1', 'P1'] },
	{ name: 'Parent2', aliases: ['Parent2', 'P2'] },
	{ name: 'Kid1', aliases: ['Kid1', 'K1', 'Sparky'] }, // multi-alias incl. nickname
	{ name: 'Kid2', aliases: ['Kid2', 'K2'] },
	{ name: 'Kid3', aliases: ['Kid3', 'K3'] }
];

describe('parseEventPeople', () => {
	it('matches a single name in the middle of a title', () => {
		expect(parseEventPeople('Lewis Bday for Kid2 and july', FAMILY)).toEqual(['Kid2']);
	});

	it('matches at the start', () => {
		expect(parseEventPeople('Kid1 training', FAMILY)).toEqual(['Kid1']);
	});

	it('matches at the end', () => {
		expect(parseEventPeople('Padel P1', FAMILY)).toEqual(['Parent1']);
	});

	it('matches initials case-insensitively', () => {
		expect(parseEventPeople('padel p1', FAMILY)).toEqual(['Parent1']);
	});

	it('matches nicknames', () => {
		expect(parseEventPeople('Sparky piano', FAMILY)).toEqual(['Kid1']);
	});

	it('matches multiple people in family-config order', () => {
		expect(parseEventPeople('P2 & P1 date night', FAMILY)).toEqual(['Parent1', 'Parent2']);
	});

	it('handles +/, separators', () => {
		expect(parseEventPeople('K2+K3 piano', FAMILY)).toEqual(['Kid2', 'Kid3']);
		expect(parseEventPeople('Kid1, Kid2 swim', FAMILY)).toEqual(['Kid1', 'Kid2']);
	});

	it('handles "Name: detail" form with a colon — the tokenizer treats : and apostrophes as separators', () => {
		// Common write-style for tagging an event to a kid: "Kid2: Ezra's birthday"
		// means "this birthday party is on Kid2's calendar". The colon, the
		// possessive apostrophe, and the friend's name (not in the family) all
		// fall away; only the family-member token survives.
		expect(parseEventPeople("Kid2: Ezra's birthday", FAMILY)).toEqual(['Kid2']);
		expect(parseEventPeople('K1: dentist', FAMILY)).toEqual(['Kid1']);
	});

	it('returns empty for unknown names', () => {
		expect(parseEventPeople('Lewis bday', FAMILY)).toEqual([]);
	});

	it('returns empty for general events', () => {
		expect(parseEventPeople('Family BBQ', FAMILY)).toEqual([]);
		expect(parseEventPeople('School holidays', FAMILY)).toEqual([]);
	});

	it('does not match aliases inside other words', () => {
		// "p1" is not a substring match — needs to be its own token
		expect(parseEventPeople('p1pe', FAMILY)).toEqual([]);
		expect(parseEventPeople('Look at the sky', FAMILY)).toEqual([]);
	});

	it('deduplicates when same alias appears twice', () => {
		expect(parseEventPeople('P1 and P1 again', FAMILY)).toEqual(['Parent1']);
	});

	it('returns empty for empty title or family', () => {
		expect(parseEventPeople('', FAMILY)).toEqual([]);
		expect(parseEventPeople('Kid1 swim', [])).toEqual([]);
	});
});
