import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg: { music?: { favourites: Record<string, string> } } = {};
const done = { confirmed: true, now: { volume: 40 } };
const speaker = { pause: vi.fn(async () => done), play: vi.fn(async () => done) };
vi.mock('#lib/server/config.ts', () => ({ getConfig: () => cfg }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/tools/music.ts', () => ({
	houseSpeaker: () => speaker,
	toSpotifyUri: () => null
}));
vi.mock('#lib/server/tools/spotify-web.ts', () => ({
	searchSpotify: vi.fn(),
	recentEpisodes: vi.fn()
}));
vi.mock('#lib/server/tools/content.ts', async () => {
	const { z } = await import('zod');
	return { AskerSchema: z.any() };
});

const { musicControlTool, musicNowTool, musicPlayTool } = await import('./spotify');
const { recentEpisodes, searchSpotify } = await import('#lib/server/tools/spotify-web.ts');

const opts = (quiet: boolean) => ({ context: { asker: { sender: 'Parent1', quiet } } }) as never;

beforeEach(() => {
	cfg.music = { favourites: { jazz: 'spotify:playlist:x' } };
	vi.clearAllMocks();
});

describe('music tools on a quiet group turn', () => {
	it('refuse without touching the speaker', async () => {
		expect(await musicControlTool.execute!({ action: 'pause' }, opts(true))).toMatchObject({
			error: expect.stringMatching(/only when/)
		});
		expect(await musicPlayTool.execute!({ what: 'jazz' }, opts(true))).toMatchObject({
			error: expect.stringMatching(/only when/)
		});
		expect(speaker.pause).not.toHaveBeenCalled();
		expect(speaker.play).not.toHaveBeenCalled();
	});

	it('work when someone asked', async () => {
		expect(await musicControlTool.execute!({ action: 'pause' }, opts(false))).toEqual({ ok: true });
		expect(speaker.pause).toHaveBeenCalledOnce();
	});
});

describe('music_play with a podcast', () => {
	const eps = [
		{ uri: 'spotify:episode:new', name: 'Newest', released: '2026-11-08' },
		{ uri: 'spotify:episode:old', name: 'Older', released: '2026-11-01' }
	];
	beforeEach(() => {
		vi.mocked(searchSpotify).mockResolvedValue([
			{ kind: 'show', uri: 'spotify:show:s', name: 'A Pod' }
		]);
		vi.mocked(recentEpisodes).mockResolvedValue(eps);
	});

	it('lists recent episodes to choose from, and plays nothing', async () => {
		const out = await musicPlayTool.execute!({ what: 'A Pod', kind: 'show' }, opts(false));
		expect(out).toMatchObject({ show: 'A Pod', episodes: eps });
		expect(speaker.play).not.toHaveBeenCalled();
	});

	it('plays the newest when asked for the latest', async () => {
		const out = await musicPlayTool.execute!(
			{ what: 'A Pod', kind: 'show', latest: true },
			opts(false)
		);
		expect(out).toMatchObject({ ok: true, playing: 'Newest', show: 'A Pod' });
		expect(speaker.play).toHaveBeenCalledWith('spotify:episode:new');
	});
});

describe('music_now', () => {
	const song = { uri: 'u', name: 'A Song', artists: ['A Band'], album: null, durationMs: 200_000 };
	const now = (over: object) => ({
		speaker: 'online',
		here: true,
		deviceName: 'Chota',
		status: 'playing',
		track: song,
		positionMs: 10_000,
		volume: 40,
		...over
	});
	const ask = async (n: object) => {
		Object.assign(speaker, { nowPlaying: () => n });
		return musicNowTool.execute!({}, opts(false));
	};

	it('reports the track and volume when the house speaker is the one playing', async () => {
		expect(await ask(now({}))).toMatchObject({ status: 'playing', track: 'A Song', volume: 40 });
	});

	it('says the speaker is silent when the account plays on another device', async () => {
		const out = await ask(now({ here: false }));
		expect(out).toMatchObject({
			status: 'silent',
			note: expect.stringMatching(/another device/),
			elsewhere: { track: 'A Song' }
		});
		expect(out).not.toHaveProperty('volume');
	});

	it('says nothing is playing here when the account is paused elsewhere', async () => {
		expect(await ask(now({ here: false, status: 'paused' }))).toMatchObject({
			status: 'silent',
			note: 'Nothing is playing on the house speaker.'
		});
	});
});
