/**
 * Spotify — what the Soloist speaker is playing, and control over it.
 *
 * The box runs Spotify Soloist (Spotify's official headless Connect client) as
 * a user service; family members pick it as a speaker in their Spotify app.
 * Soloist's local WebSocket API (`-w 127.0.0.1:9091`) pushes the playback
 * state and takes commands. This file keeps one long-lived connection, folds
 * the pushed events into one state, and exposes small controls. See
 * docs/spotify.md.
 *
 * A missing or unreachable Soloist is a normal state ("speaker offline"):
 * the client retries with backoff and never blocks boot.
 */
import { env } from '$env/dynamic/private';
import { getConfig } from '$lib/server/config';
import { logger } from '$lib/server/log';

const lg = logger('tool/spotify');

const DEFAULT_URL = 'ws://127.0.0.1:9091';
const COMMAND_TIMEOUT_MS = 3000;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 60_000;
/** After an idle → playing edge, a volume above the cap is lowered for this
 *  long (Soloist starts the first play at 100% on PipeWire, issue #23; the
 *  volume event can come before or after the status event). */
const CAP_WINDOW_MS = 10_000;
/** How long `interrupt()` waits for the pause to land before running fn. */
const PAUSE_WAIT_MS = 2000;

// --- Soloist wire types (developer.spotify.com/documentation/soloist/reference/websocket-api)

export type Status = 'idle' | 'playing' | 'paused' | 'buffering';

interface Entity {
	uri?: string;
	entity_type?: string;
	decorations?: {
		identity?: { name?: string };
		visual_identity?: { cover?: { url: string; size: string }[] };
		parent?: { entity?: Entity };
		creators?: { entity?: Entity }[];
		playback?: { duration_ms?: number };
	};
}

interface Position {
	position_ms: number;
	/** Server wall clock, epoch ms (same box, so comparable with Date.now()). */
	timestamp_ms: number;
	speed: number;
}

type ServerMessage =
	| { type: 'auth_state'; logged_in: boolean; is_active: boolean; device_name: string }
	| {
			type: 'playback_state';
			status: Status;
			item?: Entity;
			position?: Position;
			volume?: number;
			is_active?: boolean;
	  }
	| { type: 'track_changed'; item?: Entity }
	| { type: 'playback_changed'; status: Status }
	| { type: 'volume_changed'; volume: number }
	| { type: 'device_changed'; is_active: boolean; device_name: string }
	| { type: 'position_sync'; position: Position }
	| { type: 'command_result'; command: string }
	| { type: 'error'; message: string }
	| { type: 'context_changed' | 'options_changed' | 'queue_changed' };

/** The WHATWG WebSocket surface we use — Bun's and Node's global, or a fake. */
export interface SocketLike {
	readonly readyState: number;
	onopen: ((ev: unknown) => void) | null;
	onmessage: ((ev: { data: unknown }) => void) | null;
	onclose: ((ev: unknown) => void) | null;
	onerror: ((ev: unknown) => void) | null;
	send(data: string): void;
	close(): void;
}

const OPEN = 1;

// --- Our state

export interface Track {
	uri: string;
	name: string;
	artists: string[];
	album: string | null;
	cover: string | null;
	durationMs: number | null;
}

export interface NowPlaying {
	/** `offline`: no connection to Soloist. `logged-out`: connected, but no
	 *  Spotify session (bad key, or never paired). */
	speaker: 'offline' | 'logged-out' | 'online';
	deviceName: string | null;
	status: Status;
	track: Track | null;
	positionMs: number | null;
	volume: number | null;
}

/** A Spotify open link or URI → `spotify:<type>:<id>`, or null if it isn't one.
 *  Short `spotify.link/…` links need a network redirect, so they aren't taken. */
export function toSpotifyUri(input: string): string | null {
	const s = input.trim();
	const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/.exec(s);
	if (uri) return s;
	const link =
		/^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/.exec(
			s
		);
	return link ? `spotify:${link[1]}:${link[2]}` : null;
}

function name(e: Entity | undefined): string | null {
	return e?.decorations?.identity?.name ?? null;
}

function toTrack(item: Entity | undefined): Track | null {
	if (!item?.uri) return null; // an empty uri means nothing is loaded
	const d = item.decorations ?? {};
	const covers = d.visual_identity?.cover ?? [];
	const cover = covers.find((c) => c.size === 'default') ?? covers[0];
	return {
		uri: item.uri,
		name: name(item) ?? '',
		artists: (d.creators ?? []).map((c) => name(c.entity)).filter((n): n is string => !!n),
		album: name(d.parent?.entity),
		cover: cover?.url ?? null,
		durationMs: d.playback?.duration_ms ?? null
	};
}

export interface ClientOptions {
	url: string;
	connect?: (url: string) => SocketLike;
	now?: () => number;
	/** Volume ceiling 0–100; requested volumes and the first-play volume are held to it. */
	maxVolume?: number;
}

type Pending = { command: string; resolve: () => void; reject: (e: Error) => void };

export class SoloistClient {
	private socket: SocketLike | null = null;
	private connected = false;
	private stopped = true;
	private backoff = BACKOFF_MIN_MS;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private pending: Pending[] = [];
	private trackListeners = new Set<(t: Track | null) => void>();
	private statusWaiters = new Set<() => void>();
	private capUntil = 0;

	private loggedIn = false;
	/** An auth_state said signed out on this socket, so the next sign-in sends only auth_state. */
	private signedOutSeen = false;
	private deviceName: string | null = null;
	private status: Status = 'idle';
	/** Has Soloist told us its status since we connected? Until then 'idle' is
	 *  a guess, and the first status isn't an idle → playing edge. */
	private statusKnown = false;
	private track: Track | null = null;
	private position: Position | null = null;
	private volume: number | null = null;

	private readonly connectFn: (url: string) => SocketLike;
	private readonly now: () => number;

	constructor(private readonly opts: ClientOptions) {
		this.connectFn = opts.connect ?? ((url) => new WebSocket(url) as unknown as SocketLike);
		this.now = opts.now ?? Date.now;
	}

	/** Start connecting (returns at once; retries in the background). */
	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.open();
	}

	stop(): void {
		this.stopped = true;
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.retryTimer = null;
		const s = this.socket;
		this.socket = null;
		s?.close();
		this.dropped();
	}

	private open(): void {
		let s: SocketLike;
		try {
			s = this.connectFn(this.opts.url);
		} catch (error) {
			lg.warn('soloist connect failed: {error}', { error: String(error) });
			this.scheduleRetry();
			return;
		}
		this.socket = s;
		s.onopen = () => {
			this.connected = true;
			this.backoff = BACKOFF_MIN_MS;
			lg.info('soloist connected at {url}', { url: this.opts.url });
		};
		s.onmessage = (ev) => {
			try {
				this.handle(JSON.parse(String(ev.data)) as ServerMessage);
			} catch (error) {
				lg.warn('soloist sent an unreadable message: {error}', { error: String(error) });
			}
		};
		s.onerror = () => {}; // onclose follows; it does the work
		s.onclose = () => {
			if (this.socket !== s) return; // an old socket closing after stop()/reopen
			this.socket = null;
			if (this.connected) lg.warn('soloist disconnected; speaker offline');
			this.dropped();
			this.scheduleRetry();
		};
	}

	private dropped(): void {
		this.connected = false;
		this.loggedIn = false;
		this.signedOutSeen = false;
		this.statusKnown = false;
		// Offline means nothing is playing; playback_state restores it on reconnect.
		this.status = 'idle';
		this.track = null;
		this.position = null;
		for (const p of this.pending.splice(0)) p.reject(new Error('speaker offline'));
	}

	private scheduleRetry(): void {
		if (this.stopped) return;
		const wait = this.backoff;
		this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			if (!this.stopped) this.open();
		}, wait);
	}

	private handle(m: ServerMessage): void {
		switch (m.type) {
			case 'auth_state':
				// A first sign-in (someone picked the speaker) sends only auth_state; ask for the rest.
				if (m.logged_in && this.signedOutSeen && this.socket?.readyState === OPEN)
					this.socket.send(JSON.stringify({ type: 'command', command: 'get_state' }));
				this.signedOutSeen = !m.logged_in;
				this.loggedIn = m.logged_in;
				this.deviceName = m.device_name || this.deviceName;
				break;
			case 'playback_state':
				this.loggedIn = true; // only sent to a logged-in session
				this.setTrack(toTrack(m.item));
				if (m.position) this.position = m.position;
				if (typeof m.volume === 'number') this.gotVolume(m.volume);
				this.setStatus(m.status);
				break;
			case 'track_changed':
				this.setTrack(toTrack(m.item));
				break;
			case 'playback_changed':
				this.setStatus(m.status);
				break;
			case 'volume_changed':
				this.gotVolume(m.volume);
				break;
			case 'device_changed':
				this.deviceName = m.device_name || this.deviceName;
				break;
			case 'position_sync':
				this.position = m.position;
				break;
			case 'command_result': {
				const i = this.pending.findIndex((p) => p.command === m.command);
				if (i >= 0) this.pending.splice(i, 1)[0].resolve();
				break;
			}
			case 'error': {
				// No correlation id: the oldest waiting command takes the error.
				const p = this.pending.shift();
				if (p) p.reject(new Error(m.message));
				else lg.warn('soloist error: {message}', { message: m.message });
				break;
			}
		}
	}

	private setTrack(t: Track | null): void {
		if (t?.uri === this.track?.uri) {
			this.track = t;
			return;
		}
		this.track = t;
		for (const fn of this.trackListeners) {
			try {
				fn(t);
			} catch (error) {
				lg.warn('track listener threw: {error}', { error: String(error) });
			}
		}
	}

	private setStatus(s: Status): void {
		const prev = this.status;
		this.status = s;
		const known = this.statusKnown;
		this.statusKnown = true;
		if (known && prev === 'idle' && s === 'playing') {
			this.capUntil = this.now() + CAP_WINDOW_MS;
			this.applyCap();
		}
		for (const fn of this.statusWaiters) fn();
	}

	private gotVolume(v: number): void {
		this.volume = v;
		this.applyCap();
	}

	/** The issue #23 workaround: inside the window after idle → playing, hold
	 *  the volume to the cap. */
	private applyCap(): void {
		const cap = this.opts.maxVolume;
		if (cap === undefined || this.volume === null || this.now() > this.capUntil) return;
		if (this.volume <= cap) return;
		lg.info('soloist started at volume {from}; lowering to the cap {to}', {
			from: this.volume,
			to: cap
		});
		this.send('set_volume', { volume: cap }).catch((error) =>
			lg.warn('volume cap failed: {error}', { error: String(error) })
		);
	}

	/** Send a command; resolves on `command_result` (dispatched, not applied —
	 *  the state events follow), rejects on `error`, offline or timeout. */
	private send(command: string, fields: Record<string, unknown> = {}): Promise<void> {
		const s = this.socket;
		if (!s || !this.connected || s.readyState !== OPEN) {
			return Promise.reject(new Error('speaker offline'));
		}
		return new Promise<void>((resolve, reject) => {
			const p: Pending = { command, resolve, reject };
			const timer = setTimeout(() => {
				const i = this.pending.indexOf(p);
				if (i >= 0) this.pending.splice(i, 1);
				reject(new Error(`soloist did not answer ${command}`));
			}, COMMAND_TIMEOUT_MS);
			p.resolve = () => {
				clearTimeout(timer);
				resolve();
			};
			p.reject = (e) => {
				clearTimeout(timer);
				reject(e);
			};
			this.pending.push(p);
			s.send(JSON.stringify({ type: 'command', command, ...fields }));
		});
	}

	// --- Public surface

	nowPlaying(): NowPlaying {
		const speaker = !this.connected ? 'offline' : this.loggedIn ? 'online' : 'logged-out';
		return {
			speaker,
			deviceName: this.deviceName,
			status: this.status,
			track: this.track,
			positionMs: this.positionMs(),
			volume: this.volume
		};
	}

	/** Position now, interpolated from the last sync while playing. */
	private positionMs(): number | null {
		const p = this.position;
		if (!p || !this.track) return null;
		const moving = this.status === 'playing' ? p.speed : 0;
		const ms = p.position_ms + Math.max(0, this.now() - p.timestamp_ms) * moving;
		const dur = this.track.durationMs;
		return Math.round(dur !== null ? Math.min(ms, dur) : ms);
	}

	/** Play a Spotify link or URI, or resume when none is given. */
	play(uriOrLink?: string): Promise<void> {
		if (uriOrLink === undefined) return this.send('play');
		const uri = toSpotifyUri(uriOrLink);
		if (!uri) return Promise.reject(new Error(`not a Spotify link: ${uriOrLink}`));
		return this.send('play', { uri });
	}

	pause(): Promise<void> {
		return this.send('pause');
	}

	resume(): Promise<void> {
		return this.send('play');
	}

	next(): Promise<void> {
		return this.send('skip_next');
	}

	prev(): Promise<void> {
		return this.send('skip_prev');
	}

	/** Set the volume 0–100, held to `maxVolume`. Resolves to the volume sent. */
	async setVolume(n: number): Promise<number> {
		if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`volume must be 0–100, got ${n}`);
		const cap = this.opts.maxVolume ?? 100;
		const v = Math.round(Math.min(n, cap));
		await this.send('set_volume', { volume: v });
		return v;
	}

	/** Add a track to the queue (Soloist queues tracks only). */
	queue(uriOrLink: string): Promise<void> {
		const uri = toSpotifyUri(uriOrLink);
		if (!uri?.startsWith('spotify:track:')) {
			return Promise.reject(new Error(`only a Spotify track can be queued: ${uriOrLink}`));
		}
		return this.send('add_to_queue', { uri });
	}

	/** Called with the new track (or null) whenever the track changes. Returns unsubscribe. */
	onTrackChange(fn: (t: Track | null) => void): () => void {
		this.trackListeners.add(fn);
		return () => this.trackListeners.delete(fn);
	}

	/**
	 * Run fn over the music: if playing, pause, run fn, then resume (even if fn
	 * throws). If not playing, just run fn.
	 */
	async interrupt<T>(fn: () => Promise<T> | T): Promise<T> {
		const wasPlaying = this.status === 'playing' || this.status === 'buffering';
		if (!wasPlaying) return fn();
		try {
			await this.pause();
		} catch (error) {
			// The announcement matters more than the music: run it anyway.
			lg.warn('pause before interrupt failed: {error}', { error: String(error) });
			return fn();
		}
		await this.waitForStatus((s) => s !== 'playing' && s !== 'buffering', PAUSE_WAIT_MS);
		try {
			return await fn();
		} finally {
			await this.resume().catch((error) =>
				lg.warn('resume after interrupt failed: {error}', { error: String(error) })
			);
		}
	}

	private waitForStatus(ok: (s: Status) => boolean, timeoutMs: number): Promise<void> {
		if (ok(this.status)) return Promise.resolve();
		return new Promise((resolve) => {
			const done = () => {
				clearTimeout(timer);
				this.statusWaiters.delete(check);
				resolve();
			};
			const check = () => ok(this.status) && done();
			const timer = setTimeout(done, timeoutMs);
			this.statusWaiters.add(check);
		});
	}
}

// --- The one app-wide client (globalThis so a dev reload doesn't open a second socket)

declare global {
	var __chotaSoloist: SoloistClient | undefined;
}

/** The app's Soloist client, started on first use. */
export function soloist(): SoloistClient {
	if (!globalThis.__chotaSoloist) {
		globalThis.__chotaSoloist = new SoloistClient({
			url: env.SOLOIST_WS || DEFAULT_URL,
			maxVolume: getConfig().music?.maxVolume
		});
	}
	globalThis.__chotaSoloist.start();
	return globalThis.__chotaSoloist;
}

/** Boot hook: connect when `music` is configured. Returns at once. */
export function bootMusic(): void {
	if (globalThis.__chotaSoloist) globalThis.__chotaSoloist.stop();
	globalThis.__chotaSoloist = undefined;
	if (getConfig().music) soloist();
}

export function stopMusic(): void {
	globalThis.__chotaSoloist?.stop();
}

/** Speaker state for /api/health, or null when music isn't configured. */
export function musicHealth(): Pick<NowPlaying, 'speaker' | 'deviceName' | 'status'> | null {
	if (!getConfig().music) return null;
	const { speaker, deviceName, status } = soloist().nowPlaying();
	return { speaker, deviceName: deviceName ?? getConfig().music?.deviceName ?? null, status };
}
