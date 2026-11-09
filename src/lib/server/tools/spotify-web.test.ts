import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { SPOTIFY_CLIENT_ID: 'id', SPOTIFY_CLIENT_SECRET: 'secret' }
}));
type Module = typeof import('./spotify-web');
let searchSpotify: Module['searchSpotify'];
let toFound: Module['toFound'];
let recentEpisodes: Module['recentEpisodes'];

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const tracks = {
	tracks: {
		items: [
			{
				uri: 'spotify:track:a',
				name: 'Kiss from a Rose',
				artists: [{ name: 'Seal' }],
				album: { name: 'Seal II' }
			},
			null,
			{ uri: 'spotify:track:b', name: 'Roses', artists: [{ name: 'Khari' }] }
		]
	}
};

/** Stands in for the global fetch the SDK uses; `searches` answer in order. */
function fakeSpotify(searches: Response[]) {
	const calls: { url: string; auth?: string }[] = [];
	let tokens = 0;
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: string | URL, init?: RequestInit) => {
			const url = String(input);
			const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
			calls.push({ url, auth });
			if (url.includes('/api/token'))
				return json(200, {
					access_token: `tok${++tokens}`,
					token_type: 'Bearer',
					expires_in: 3600
				});
			return searches.shift() ?? json(500, {});
		})
	);
	return { calls };
}

// A fresh module each test: the client and its token live at module level.
beforeEach(async () => {
	vi.resetModules();
	({ searchSpotify, toFound, recentEpisodes } = await import('./spotify-web'));
});
afterEach(() => vi.unstubAllGlobals());

describe('toFound', () => {
	it('names artists for tracks, the owner for playlists, and skips nulls', () => {
		expect(toFound('track', tracks.tracks.items[0])).toEqual({
			kind: 'track',
			uri: 'spotify:track:a',
			name: 'Kiss from a Rose',
			by: 'Seal',
			album: 'Seal II'
		});
		expect(
			toFound('playlist', {
				uri: 'spotify:playlist:p',
				name: 'Soft 90s',
				owner: { display_name: 'Spotify' }
			})
		).toEqual({ kind: 'playlist', uri: 'spotify:playlist:p', name: 'Soft 90s', by: 'Spotify' });
		expect(toFound('track', null)).toBeUndefined();
	});
});

describe('searchSpotify', () => {
	it('gets a token once, asks for the AU market, caps the limit at 10, and drops null items', async () => {
		const { calls } = fakeSpotify([json(200, tracks), json(200, tracks)]);
		const found = await searchSpotify('kiss from a rose', { limit: 50 });
		expect(found.map((f) => f.uri)).toEqual(['spotify:track:a', 'spotify:track:b']);
		const search = new URL(calls[1].url);
		expect(search.searchParams.get('limit')).toBe('10');
		expect(search.searchParams.get('market')).toBe('AU');
		expect(search.searchParams.get('type')).toBe('track');
		expect(calls[1].auth).toBe('Bearer tok1');
		expect(calls[0].auth).toBe(`Basic ${btoa('id:secret')}`);

		await searchSpotify('again');
		expect(calls.filter((c) => c.url.includes('/api/token'))).toHaveLength(1);
	});

	it('gets a fresh token once on a 401', async () => {
		const { calls } = fakeSpotify([json(401, {}), json(200, tracks)]);
		expect(await searchSpotify('x')).toHaveLength(2);
		expect(calls.filter((c) => c.url.includes('/api/token'))).toHaveLength(2);
		expect(calls.at(-1)?.auth).toBe('Bearer tok2');
	});

	it('returns nothing for a blank query without calling Spotify, and throws on other errors', async () => {
		const { calls } = fakeSpotify([json(500, { error: 'boom' })]);
		expect(await searchSpotify('  ')).toEqual([]);
		expect(calls).toHaveLength(0);
		await expect(searchSpotify('x')).rejects.toThrow(/Spotify 500/);
	});
});

describe('errors and rate limits', () => {
	it('waits out a short Retry-After once, and refuses a long one', async () => {
		vi.useFakeTimers();
		const limited = (s: string) =>
			new Response('{}', { status: 429, headers: { 'Retry-After': s } });
		fakeSpotify([limited('2'), json(200, tracks)]);
		const pending = searchSpotify('x');
		await vi.advanceTimersByTimeAsync(2000);
		expect(await pending).toHaveLength(2);
		vi.useRealTimers();

		vi.resetModules();
		({ searchSpotify } = await import('./spotify-web'));
		fakeSpotify([limited('120')]);
		await expect(searchSpotify('x')).rejects.toThrow(/try again in 120 s/);
	});
});

describe('recentEpisodes', () => {
	it('asks for that show in the AU market and drops null items', async () => {
		const { calls } = fakeSpotify([
			json(200, {
				items: [{ uri: 'spotify:episode:e', name: 'Ep 1', release_date: '2026-11-08' }, null]
			})
		]);
		expect(await recentEpisodes('spotify:show:abc')).toEqual([
			{ uri: 'spotify:episode:e', name: 'Ep 1', released: '2026-11-08' }
		]);
		const url = new URL(calls.at(-1)!.url);
		expect(url.pathname).toMatch(/shows\/abc\/episodes/);
		expect(url.searchParams.get('market')).toBe('AU');
	});
});
