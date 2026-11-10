/**
 * The house speaker (Spotify Soloist on the box), through `@khalido/home`'s
 * spotify connector (it replaced chota's own Soloist client on 10 Nov 2026,
 * after driving the real speaker on the Pi).
 *
 * The connector owns the socket, reconnects, the volume cap, confirmed writes,
 * `duck` and `interrupt`. This file adds the one rule that is chota's:
 *
 *   Spotify plays on one device per account. When the family's music is on a
 *   phone or a Google speaker, Soloist still reports "playing" with
 *   `active: false`. chota must not say the house speaker is playing then, and
 *   must not pause, skip or turn down music that is somewhere else. Two things
 *   move the music to the house speaker: an explicit "play X", and "resume"
 *   when nothing is playing anywhere (the paused session then carries on from
 *   the box, even if it was paused on another speaker).
 *
 * No env, config or logging in here (the boot hook passes the URL and the
 * cap), so a script can drive a real Soloist with it. See docs/spotify.md.
 */
import { ConnectorError, createHome, type ConnectorCode } from '@khalido/home';
import {
	positionMs,
	speakerState,
	spotify,
	toSpotifyUri,
	type SocketFactory,
	type SpotifyState
} from '@khalido/home/spotify';

export { toSpotifyUri };

export interface NowPlaying {
	/** `offline`: Soloist can't be reached. `waiting`: it runs, but nobody is
	 *  signed in on it. `online`: signed in. */
	speaker: 'offline' | 'waiting' | 'online';
	/** Is this speaker the one making the sound? False while the account's music
	 *  is on another device, whatever `status` says. */
	here: boolean;
	deviceName: string | null;
	/** idle, playing, paused or buffering: the account's playback, wherever it is. */
	status: string;
	track: {
		uri: string;
		name: string | null;
		artists: string[];
		album: string | null;
		durationMs: number | null;
	} | null;
	positionMs: number | null;
	/** 0–100. Not meaningful while `here` is false. */
	volume: number | null;
}

/** What a write left, and whether Soloist reported the change inside 2 s. */
export interface Done {
	confirmed: boolean;
	now: NowPlaying;
}

/** A refusal or failure worded for the person who asked. */
export class MusicError extends Error {}

export interface MusicOptions {
	/** Soloist's WebSocket. The connector's default is ws://127.0.0.1:9091. */
	url?: string;
	/** Volume ceiling 0–100. */
	maxVolume?: number;
	/** Opens the socket; tests pass a fake. */
	connect?: SocketFactory;
}

const ELSEWHERE =
	"Spotify is playing on another speaker, not the house speaker, so I've left it alone";
const NOTHING_HERE = 'nothing is playing on the house speaker';

/** A connector error in the family's words. */
function reword(err: unknown): Error {
	if (err instanceof MusicError) return err;
	if (!(err instanceof ConnectorError)) return err instanceof Error ? err : new Error(String(err));
	const refused = `the house speaker refused: ${err.message}`;
	// Every code the library sets: a new one fails to compile here.
	const say: Record<ConnectorCode, string> = {
		offline: 'the house speaker is offline',
		waiting: 'nobody is signed in to Spotify on the house speaker',
		inactive: NOTHING_HERE,
		timeout: "the house speaker didn't answer",
		invalid: err.message,
		refused,
		// Hue's and the printers' codes; the Spotify connector never sets them.
		link_button: refused,
		ipp: refused
	};
	return new MusicError(err.code ? say[err.code] : refused, { cause: err });
}

export function createMusic(opts: MusicOptions = {}) {
	const speaker = spotify({ url: opts.url, maxVolume: opts.maxVolume, connect: opts.connect });
	const home = createHome([speaker]);
	let running: AbortController | null = null;

	const part = () => home.part('spotify');
	const state = (): SpotifyState | undefined => part()?.state;

	function nowPlaying(): NowPlaying {
		const s = state();
		const sp = speakerState(part());
		const t = s?.track;
		return {
			speaker:
				sp === 'offline' || sp === 'connecting'
					? 'offline'
					: sp === 'waiting'
						? 'waiting'
						: 'online',
			here: s?.active === true,
			deviceName: s?.deviceName ?? null,
			status: s?.status ?? 'idle',
			track: t
				? {
						uri: t.uri,
						name: t.name ?? null,
						artists: t.artists,
						album: t.album ?? null,
						durationMs: t.durationMs ?? null
					}
				: null,
			positionMs: s ? (positionMs(s, Date.now()) ?? null) : null,
			volume: s?.volume ?? null
		};
	}

	/** Music on another device: playing or buffering, and not from here. */
	const elsewhere = () => {
		const n = nowPlaying();
		return (
			n.speaker === 'online' && !n.here && (n.status === 'playing' || n.status === 'buffering')
		);
	};

	/** Run a write, return what it left, and word any failure for a person. */
	async function run(write: () => Promise<{ confirmed: boolean }>): Promise<Done> {
		try {
			const { confirmed } = await write();
			return { confirmed, now: nowPlaying() };
		} catch (err) {
			throw reword(err);
		}
	}

	/** A control that only makes sense on music this speaker is playing. */
	function onlyHere(write: () => Promise<{ confirmed: boolean }>): Promise<Done> {
		if (elsewhere()) return Promise.reject(new MusicError(ELSEWHERE));
		if (nowPlaying().speaker === 'online' && !nowPlaying().here)
			return Promise.reject(new MusicError(NOTHING_HERE));
		return run(write);
	}

	return {
		/** Start connecting (returns at once; the connector retries in the background). */
		start(): void {
			if (running) return;
			running = new AbortController();
			void home.start(running.signal);
		},
		stop(): void {
			running?.abort();
			running = null;
		},
		nowPlaying,

		/** Play a Spotify link or URI on the house speaker. This is the one write
		 *  that takes the music from another device: someone asked for it here. */
		play(linkOrUri: string): Promise<Done> {
			if (!toSpotifyUri(linkOrUri))
				return Promise.reject(new MusicError(`not a Spotify link: ${linkOrUri}`));
			return run(() => speaker.play(linkOrUri));
		},
		/** Carry on with what was paused. Refused while the music is elsewhere. */
		resume(): Promise<Done> {
			if (elsewhere()) return Promise.reject(new MusicError(ELSEWHERE));
			// `play()` with no link makes the speaker the active device first.
			return run(() => speaker.play());
		},
		pause: () => onlyHere(() => speaker.pause()),
		next: () => onlyHere(() => speaker.next()),
		prev: () => onlyHere(() => speaker.prev()),
		/** Set the volume 0–100, held to `maxVolume`. `now.volume` is what it ended at. */
		setVolume: (n: number) => onlyHere(() => speaker.setVolume(n)),
		/** Add a track to the queue (Soloist queues tracks only). */
		queue: (track: string) => onlyHere(() => speaker.queue(track)),

		/** Turn the music down to `to` while `fn` runs (a regular announcement),
		 *  then put it back. Music on another device isn't this speaker's to lower:
		 *  `fn` just runs (`music: 'untouched'`). */
		async duck<T>(fn: () => Promise<T> | T, to: number) {
			if (elsewhere()) return { value: await fn(), music: 'untouched' as const };
			return speaker.duck(fn, { to });
		},
		/** Pause while `fn` runs (an important announcement), then resume. The
		 *  connector pauses whenever the account is playing, so the check for
		 *  music on another device is made here. */
		async interrupt<T>(fn: () => Promise<T> | T) {
			if (elsewhere()) return { value: await fn(), music: 'untouched' as const };
			return speaker.interrupt(fn);
		}
	};
}

export type Music = ReturnType<typeof createMusic>;

// --- The app's one speaker -------------------------------------------------

declare global {
	// Kept on globalThis so a dev-server reload replaces the client instead of
	// leaving a second socket open.
	var __chotaMusic: Music | undefined;
}

/** Boot hook: connect when `music` is configured (pass null when it isn't).
 *  Returns at once; an absent Soloist is just "offline". */
export function bootMusic(opts: MusicOptions | null): void {
	globalThis.__chotaMusic?.stop();
	globalThis.__chotaMusic = opts ? createMusic(opts) : undefined;
	globalThis.__chotaMusic?.start();
}

export function stopMusic(): void {
	globalThis.__chotaMusic?.stop();
}

/** The house speaker. Callers check `getConfig().music` first. */
export function houseSpeaker(): Music {
	if (!globalThis.__chotaMusic) throw new MusicError('music is not set up');
	return globalThis.__chotaMusic;
}

/** Speaker state for /api/health, or null when music isn't configured. */
export function musicHealth(): Pick<
	NowPlaying,
	'speaker' | 'here' | 'deviceName' | 'status'
> | null {
	if (!globalThis.__chotaMusic) return null;
	const { speaker, here, deviceName, status } = globalThis.__chotaMusic.nowPlaying();
	return { speaker, here, deviceName, status };
}
