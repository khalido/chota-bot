import { describe, it, expect } from 'vitest';
import { getChores } from './chores';
import type { ChotaConfig } from '$lib/config';

// Placeholder kids — real names live only in chota.config.ts (gitignored).
const fixture: ChotaConfig = {
	kids: [
		{ name: 'Kid1', buses: [] },
		{ name: 'Kid2', buses: [] },
		{ name: 'Kid3', buses: [] }
	],
	chores: {
		definitions: {
			dish: 'Empty dishwasher',
			dog: 'Walk dog'
		},
		rotation: {
			Mon: { dish: 'Kid1', dog: 'Kid3' },
			Tue: { dish: 'Kid3', dog: 'Kid2' },
			Wed: { dish: 'Kid2', dog: 'Kid1' },
			Thu: { dish: 'Kid1', dog: 'Kid2' },
			Fri: { dish: 'Kid3', dog: 'Kid1' },
			Sat: { dish: 'Kid1', dog: 'Kid2' },
			Sun: {}
		}
	}
};

describe('getChores', () => {
	it('returns Mondays chores grouped by person', () => {
		const result = getChores({ day: 'Mon' }, fixture);
		expect(result).toEqual([
			{ person: 'Kid1', chores: ['Empty dishwasher'] },
			{ person: 'Kid3', chores: ['Walk dog'] }
		]);
	});

	it('groups multiple chores under one person', () => {
		const config: ChotaConfig = {
			...fixture,
			chores: {
				definitions: { ...fixture.chores!.definitions, bin: 'Take out bin' },
				rotation: {
					...fixture.chores!.rotation,
					Mon: { dish: 'Kid1', dog: 'Kid1', bin: 'Kid2' }
				}
			}
		};
		const result = getChores({ day: 'Mon' }, config);
		expect(result).toContainEqual({ person: 'Kid1', chores: ['Empty dishwasher', 'Walk dog'] });
		expect(result).toContainEqual({ person: 'Kid2', chores: ['Take out bin'] });
	});

	it('returns empty for a day with no chores', () => {
		expect(getChores({ day: 'Sun' }, fixture)).toEqual([]);
	});

	it('filters by person (case-insensitive)', () => {
		const result = getChores({ day: 'Mon', person: 'kid1' }, fixture);
		expect(result).toEqual([{ person: 'Kid1', chores: ['Empty dishwasher'] }]);
	});

	it('returns empty when filter person has no chore that day', () => {
		expect(getChores({ day: 'Mon', person: 'Kid2' }, fixture)).toEqual([]);
	});

	it('returns empty when chores config is missing', () => {
		const noChores: ChotaConfig = { kids: fixture.kids };
		expect(getChores({ day: 'Mon' }, noChores)).toEqual([]);
	});

	it('falls back to chore key if no definition', () => {
		const config: ChotaConfig = {
			...fixture,
			chores: {
				definitions: {},
				rotation: { ...fixture.chores!.rotation, Mon: { dish: 'Kid1' } }
			}
		};
		expect(getChores({ day: 'Mon' }, config)).toEqual([{ person: 'Kid1', chores: ['dish'] }]);
	});

	it('uses now (Sydney) when day not specified', () => {
		// 9 May 2026 = Saturday Sydney time (regardless of UTC instant within Sat)
		const sat = new Date('2026-05-09T05:00:00Z');
		expect(getChores({ now: sat }, fixture)).toEqual([
			{ person: 'Kid1', chores: ['Empty dishwasher'] },
			{ person: 'Kid2', chores: ['Walk dog'] }
		]);
	});
});
