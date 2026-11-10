/**
 * music agent-tools — the Soloist speaker on the box (Spotify Connect).
 *
 * Wraps `#lib/server/tools/music`: `music_now` (what's playing),
 * `music_control` (pause, resume, skip, volume) and `music_play` (a favourite
 * from `chota.config.ts > music.favourites`, a Spotify link, or a catalogue
 * search through `tools/spotify-web.ts`, whose best match Soloist plays).
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getConfig } from '#lib/server/config.ts';
import { houseSpeaker, toSpotifyUri, type Done, type NowPlaying } from '#lib/server/tools/music.ts';
import { recentEpisodes, searchSpotify } from '#lib/server/tools/spotify-web.ts';
import { AskerSchema } from '#lib/server/tools/content.ts';
import { errorMessage } from '#lib/server/log.ts';

const NOT_SET_UP = { error: 'music is not set up (no music in chota.config.ts)' };
/** An untagged group message can't change the music, whatever the model decides. */
const QUIET = { error: 'only when someone asks me to' };
const contextSchema = z.object({ asker: AskerSchema.optional() });

function shape(n: NowPlaying) {
	if (n.speaker === 'offline') return { speaker: 'offline' };
	if (n.speaker === 'waiting') return { speaker: 'not signed in to Spotify' };
	const track = n.track
		? {
				track: n.track.name,
				artists: n.track.artists.join(', '),
				album: n.track.album,
				position_s: n.positionMs === null ? null : Math.round(n.positionMs / 1000),
				length_s: n.track.durationMs === null ? null : Math.round(n.track.durationMs / 1000)
			}
		: {};
	// Spotify plays on one device per account. Soloist reports the account's
	// playback even when it is on a phone or another speaker, so say which.
	if (!n.here) {
		const playing = n.status === 'playing' || n.status === 'buffering';
		return {
			speaker: n.deviceName,
			status: 'silent',
			note: playing
				? 'Spotify is playing on another device (a phone or another speaker), not the house speaker.'
				: 'Nothing is playing on the house speaker.',
			...(playing ? { elsewhere: track } : {})
		};
	}
	return { speaker: n.deviceName, status: n.status, volume: n.volume, ...track };
}

/** A write's result for the model: done, or sent but not yet seen to take. */
const sent = (d: Done) =>
	d.confirmed ? {} : { note: 'Sent, but the speaker has not reported the change yet.' };

/** A podcast: play the newest episode if asked for it, else list the last few to choose from. */
async function podcast(show: string, uri: string, latest: boolean | undefined) {
	const episodes = await recentEpisodes(uri);
	if (!episodes.length) return { error: `no episodes of ${show}` };
	if (!latest)
		return { show, episodes, source: 'Spotify', next: 'Ask which one, then play its uri.' };
	const done = await houseSpeaker().play(episodes[0].uri);
	return {
		ok: true,
		...sent(done),
		playing: episodes[0].name,
		show,
		released: episodes[0].released,
		source: 'Spotify'
	};
}

export const musicNowTool = tool({
	description: 'What the house speaker (Spotify) is playing right now, or that nothing is.',
	inputSchema: z.object({}),
	execute: async () => {
		if (!getConfig().music) return NOT_SET_UP;
		return shape(houseSpeaker().nowPlaying());
	}
});

export const musicControlTool = tool({
	description: 'Control the house speaker: pause, resume, next, prev, or set the volume (0–100).',
	inputSchema: z.object({
		action: z.enum(['pause', 'resume', 'next', 'prev', 'volume']),
		volume: z.number().int().min(0).max(100).describe('Only for action=volume.').optional()
	}),
	contextSchema,
	execute: async ({ action, volume }, { context }) => {
		if (!getConfig().music) return NOT_SET_UP;
		if (context.asker?.quiet) return QUIET;
		const s = houseSpeaker();
		try {
			if (action === 'volume') {
				if (volume === undefined) return { error: 'volume needs a number 0–100' };
				const done = await s.setVolume(volume);
				// What it ended at: a request above the cap comes back as the cap.
				return { ok: true, ...sent(done), volume: done.now.volume };
			}
			return { ok: true, ...sent(await s[action]()) };
		} catch (err) {
			return { error: errorMessage(err) };
		}
	}
});

export const musicPlayTool = tool({
	description:
		'Play music on the house speaker: a saved favourite by name, a Spotify link, or a search ' +
		'("Kiss from a Rose", "Taylor Swift", "lo-fi study playlist"). A search is for music unless they say podcast, and plays the best match; ' +
		'say what you put on (it is from Spotify), and offer the alternatives if it might be the wrong one.',
	inputSchema: z.object({
		what: z
			.string()
			.describe(
				'A favourite name, a Spotify link or spotify: URI, or a search. Narrow a search with ' +
					'Spotify filters when you know them: track:"Kiss from a Rose" artist:Seal, ' +
					'year:1990-1999, genre:jazz (tracks, artists), album:..., tag:new (albums out in the last two weeks).'
			),
		kind: z
			.enum(['track', 'album', 'playlist', 'artist', 'show', 'episode'])
			.optional()
			.describe(
				'For a search: default track. "album" or "artist" when they name one, "playlist" for a mood or genre. "show" only when they ask for a podcast, by its name: that returns its recent episodes to ask about. "episode" only for one particular episode.'
			),
		latest: z
			.boolean()
			.optional()
			.describe(
				'With kind "show": play the newest episode instead of asking. Only when they said latest.'
			)
	}),
	contextSchema,
	execute: async ({ what, kind, latest }, { context }) => {
		const music = getConfig().music;
		if (!music) return NOT_SET_UP;
		if (context.asker?.quiet) return QUIET;
		const key = Object.keys(music.favourites).find(
			(k) => k.toLowerCase() === what.trim().toLowerCase()
		);
		try {
			if (key) {
				const done = await houseSpeaker().play(music.favourites[key]);
				return { ok: true, ...sent(done), playing: key, from: 'favourites' };
			}
			if (toSpotifyUri(what)) {
				const done = await houseSpeaker().play(what);
				return { ok: true, ...sent(done), playing: what };
			}
			const found = await searchSpotify(what, { kinds: [kind ?? 'track'], limit: 3 });
			if (!found.length) return { error: `nothing on Spotify for "${what}"` };
			const [best, ...rest] = found;
			if (best.kind === 'show') return await podcast(best.name, best.uri, latest);
			const done = await houseSpeaker().play(best.uri);
			const label = (f: (typeof found)[number]) => (f.by ? `${f.name} by ${f.by}` : f.name);
			return {
				ok: true,
				...sent(done),
				playing: label(best),
				kind: best.kind,
				source: 'Spotify',
				...(rest.length ? { alternatives: rest.map(label) } : {})
			};
		} catch (err) {
			return { error: errorMessage(err), favourites: Object.keys(music.favourites) };
		}
	}
});
