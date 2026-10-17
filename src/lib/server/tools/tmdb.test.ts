import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/private', () => ({ TMDB_READ_ACCESS_TOKEN: 'test' }));
vi.mock('$lib/server/log', () => ({ log: vi.fn(), logErr: vi.fn() }));

const { auReleases, pickMatch, pickProviders, pickRating } = await import('./tmdb');

const hit = (title: string, id: number) => ({
	kind: 'movie' as const,
	id,
	title,
	year: 2020,
	overview: '',
	popularity: 1,
	posterUrl: null
});

describe('pickMatch', () => {
	it('prefers an exact title in the top five over TMDB first', () => {
		const hits = [hit('Dune: Part Two', 1), hit('Dune', 2)];
		expect(pickMatch('dune', hits)?.id).toBe(2);
		expect(pickMatch('dune part', hits)?.id).toBe(1);
		expect(pickMatch('x', [])).toBeNull();
	});
});

describe('pickRating', () => {
	it('takes the AU classification, else the US one, and flags above PG-13', () => {
		expect(
			pickRating([
				{ country: 'US', labels: ['R'] },
				{ country: 'AU', labels: ['', 'M'] }
			])
		).toEqual({ country: 'AU', label: 'M', mature: false });
		expect(pickRating([{ country: 'US', labels: ['', 'TV-MA'] }])).toEqual({
			country: 'US',
			label: 'TV-MA',
			mature: true
		});
		expect(pickRating([{ country: 'AU', labels: ['MA15+'] }])?.mature).toBe(true);
		expect(pickRating([{ country: 'AU', labels: ['MA 15+'] }])?.mature).toBe(true);
		expect(pickRating([{ country: 'GB', labels: ['15'] }])).toBeNull();
	});
});

describe('pickProviders', () => {
	it('keeps one entry per service, its best offer', () => {
		const out = pickProviders({
			link: 'x',
			flatrate: [{ provider_name: 'Netflix', logo_path: '/n.png' }],
			rent: [
				{ provider_name: 'Netflix', logo_path: null },
				{ provider_name: 'Apple TV', logo_path: null }
			]
		});
		expect(out.map((p) => `${p.name}:${p.type}`)).toEqual(['Netflix:flatrate', 'Apple TV:rent']);
		expect(pickProviders(undefined)).toEqual([]);
	});
});

describe('auReleases', () => {
	it('takes the earliest cinema and digital dates', () => {
		expect(
			auReleases([
				{ type: 3, release_date: '2021-12-02T00:00:00.000Z' },
				{ type: 2, release_date: '2021-11-20T00:00:00.000Z' },
				{ type: 4, release_date: '2022-01-15T00:00:00.000Z' },
				{ type: 1, release_date: '2021-09-03T00:00:00.000Z' }
			])
		).toEqual({ cinema: '2021-11-20', digital: '2022-01-15' });
		expect(auReleases([])).toEqual({ cinema: undefined, digital: undefined });
	});
});
