import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg: { music?: { favourites: Record<string, string> } } = {};
const speaker = { pause: vi.fn(), play: vi.fn() };
vi.mock('$lib/server/config', () => ({ getConfig: () => cfg }));
vi.mock('$lib/server/log', () => import('$lib/server/log.mock'));
vi.mock('$lib/server/tools/spotify', () => ({ soloist: () => speaker, toSpotifyUri: () => null }));
vi.mock('$lib/server/tools/spotify-web', () => ({
	searchSpotify: vi.fn(),
	recentEpisodes: vi.fn()
}));
vi.mock('$lib/server/tools/content', async () => {
	const { z } = await import('zod');
	return { AskerSchema: z.any() };
});

const { musicControlTool, musicPlayTool } = await import('./spotify');
const { recentEpisodes, searchSpotify } = await import('$lib/server/tools/spotify-web');

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
