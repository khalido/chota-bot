import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoloistClient, toSpotifyUri, type SocketLike } from './spotify';

/** A fake Soloist socket: records what the client sends, and lets a test push
 *  server frames, open it, or drop it. */
class FakeSocket implements SocketLike {
	readyState = 0;
	sent: Record<string, unknown>[] = [];
	onopen: ((ev: unknown) => void) | null = null;
	onmessage: ((ev: { data: unknown }) => void) | null = null;
	onclose: ((ev: unknown) => void) | null = null;
	onerror: ((ev: unknown) => void) | null = null;
	send(data: string) {
		this.sent.push(JSON.parse(data));
	}
	close() {
		this.readyState = 3;
		this.onclose?.({});
	}
	open() {
		this.readyState = 1;
		this.onopen?.({});
	}
	push(msg: Record<string, unknown>) {
		this.onmessage?.({ data: JSON.stringify(msg) });
	}
	drop() {
		this.readyState = 3;
		this.onclose?.({});
	}
	/** The last command sent, answered with a command_result. */
	ack() {
		const last = this.sent.at(-1)!;
		this.push({ type: 'command_result', command: last.command });
		return last;
	}
}

const entity = (uri: string, nm: string, extra: Record<string, unknown> = {}) => ({
	uri,
	entity_type: 'track',
	decorations: { identity: { name: nm }, ...extra }
});

const TRACK = entity('spotify:track:abc123', 'Song A', {
	visual_identity: {
		cover: [
			{ url: 'https://i.example/small.jpg', size: 'small' },
			{ url: 'https://i.example/default.jpg', size: 'default' }
		]
	},
	parent: { entity: entity('spotify:album:alb1', 'Album A') },
	creators: [
		{ entity: entity('spotify:artist:a1', 'Artist One') },
		{ entity: entity('spotify:artist:a2', 'Artist Two') }
	],
	playback: { duration_ms: 200_000 }
});

let clock = 1_000_000;
let sockets: FakeSocket[] = [];

function client(maxVolume?: number) {
	const c = new SoloistClient({
		url: 'ws://test',
		maxVolume,
		now: () => clock,
		connect: () => {
			const s = new FakeSocket();
			sockets.push(s);
			return s;
		}
	});
	c.start();
	return c;
}

function online(state: Record<string, unknown> = {}) {
	const s = sockets.at(-1)!;
	s.open();
	s.push({ type: 'auth_state', logged_in: true, is_active: true, device_name: 'Kitchen' });
	s.push({
		type: 'playback_state',
		status: 'idle',
		item: { uri: '', entity_type: '' },
		volume: 40,
		...state
	});
	return s;
}

beforeEach(() => {
	clock = 1_000_000;
	sockets = [];
	vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('toSpotifyUri', () => {
	it('turns open.spotify.com links into URIs', () => {
		expect(toSpotifyUri('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x1')).toBe(
			'spotify:track:4uLU6hMCjMI75M1A2tKUQC'
		);
		expect(toSpotifyUri('https://open.spotify.com/intl-en/playlist/37i9dQZF1DX')).toBe(
			'spotify:playlist:37i9dQZF1DX'
		);
	});

	it('passes URIs through and rejects other things', () => {
		expect(toSpotifyUri('spotify:album:1DFixLWuPkv3KT3TnV35m3')).toBe(
			'spotify:album:1DFixLWuPkv3KT3TnV35m3'
		);
		expect(toSpotifyUri('https://spotify.link/abc')).toBeNull();
		expect(toSpotifyUri('friday')).toBeNull();
	});
});

describe('SoloistClient state', () => {
	it('is offline before connecting and logged-out without a session', () => {
		const c = client();
		expect(c.nowPlaying().speaker).toBe('offline');
		sockets[0].open();
		sockets[0].push({ type: 'auth_state', logged_in: false, is_active: false, device_name: 'K' });
		expect(c.nowPlaying().speaker).toBe('logged-out');
	});

	it('asks for the state when someone first picks the speaker', () => {
		client();
		const s = sockets[0];
		s.open();
		s.push({ type: 'auth_state', logged_in: false, is_active: false, device_name: 'K' });
		expect(s.sent).toEqual([]);
		s.push({ type: 'auth_state', logged_in: true, is_active: true, device_name: 'K' });
		expect(s.sent.map((m) => m.command)).toEqual(['get_state']);
	});

	it('reads playback_state, then applies incremental events', () => {
		const c = client();
		const s = online({ status: 'paused', item: TRACK });
		expect(c.nowPlaying()).toMatchObject({
			speaker: 'online',
			deviceName: 'Kitchen',
			status: 'paused',
			volume: 40,
			track: {
				uri: 'spotify:track:abc123',
				name: 'Song A',
				artists: ['Artist One', 'Artist Two'],
				album: 'Album A',
				cover: 'https://i.example/default.jpg',
				durationMs: 200_000
			}
		});
		s.push({ type: 'track_changed', item: entity('spotify:track:zzz', 'Song B') });
		s.push({ type: 'playback_changed', status: 'playing' });
		s.push({ type: 'volume_changed', volume: 55 });
		s.push({ type: 'device_changed', is_active: true, device_name: 'Lounge' });
		const n = c.nowPlaying();
		expect([n.track?.name, n.status, n.volume, n.deviceName]).toEqual([
			'Song B',
			'playing',
			55,
			'Lounge'
		]);
	});

	it('treats an empty item uri as nothing loaded', () => {
		const c = client();
		online();
		expect(c.nowPlaying().track).toBeNull();
	});

	it('interpolates the position while playing, not while paused', () => {
		const c = client();
		const s = online({
			status: 'playing',
			item: TRACK,
			position: { position_ms: 10_000, timestamp_ms: clock, speed: 1 }
		});
		clock += 5_000;
		expect(c.nowPlaying().positionMs).toBe(15_000);
		s.push({ type: 'playback_changed', status: 'paused' });
		expect(c.nowPlaying().positionMs).toBe(10_000);
		s.push({
			type: 'position_sync',
			position: { position_ms: 30_000, timestamp_ms: clock, speed: 1 }
		});
		expect(c.nowPlaying().positionMs).toBe(30_000);
	});

	it('tells listeners when the track changes', () => {
		const c = client();
		const s = online();
		const seen: (string | null)[] = [];
		c.onTrackChange((t) => seen.push(t?.name ?? null));
		s.push({ type: 'track_changed', item: TRACK });
		s.push({ type: 'track_changed', item: TRACK }); // same track: no event
		s.push({ type: 'track_changed', item: entity('spotify:track:zzz', 'Song B') });
		expect(seen).toEqual(['Song A', 'Song B']);
	});
});

describe('SoloistClient commands', () => {
	it('sends commands and resolves on command_result', async () => {
		const c = client();
		const s = online();
		const p = c.play('https://open.spotify.com/album/alb1?si=1');
		expect(s.ack()).toEqual({ type: 'command', command: 'play', uri: 'spotify:album:alb1' });
		await expect(p).resolves.toBeUndefined();
		const r = c.resume();
		expect(s.ack()).toEqual({ type: 'command', command: 'play' });
		await r;
	});

	it('rejects on a Soloist error, and when offline', async () => {
		const c = client();
		await expect(c.pause()).rejects.toThrow('speaker offline');
		const s = online();
		const p = c.next();
		s.push({ type: 'error', message: 'command requires authentication' });
		await expect(p).rejects.toThrow('command requires authentication');
	});

	it('queues tracks only', async () => {
		const c = client();
		online();
		await expect(c.queue('spotify:album:alb1')).rejects.toThrow('only a Spotify track');
	});

	it('holds a requested volume to maxVolume', async () => {
		const c = client(60);
		const s = online();
		const p = c.setVolume(90);
		expect(s.ack()).toMatchObject({ command: 'set_volume', volume: 60 });
		await expect(p).resolves.toBe(60);
		await expect(c.setVolume(120)).rejects.toThrow('0–100');
	});
});

describe('volume cap on first play', () => {
	it('lowers the volume when playing starts from idle above the cap', () => {
		client(60);
		const s = online({ volume: 100 });
		s.push({ type: 'playback_changed', status: 'playing' });
		expect(s.sent).toEqual([{ type: 'command', command: 'set_volume', volume: 60 }]);
	});

	it('also catches the volume event arriving after the status event', () => {
		client(60);
		const s = online({ volume: 30 });
		s.push({ type: 'playback_changed', status: 'playing' });
		expect(s.sent).toEqual([]);
		s.push({ type: 'volume_changed', volume: 100 });
		expect(s.sent).toEqual([{ type: 'command', command: 'set_volume', volume: 60 }]);
	});

	it('leaves the volume alone outside the window, or when resuming from pause', () => {
		client(60);
		const s = online({ status: 'paused', volume: 90 });
		s.push({ type: 'playback_changed', status: 'playing' });
		expect(s.sent).toEqual([]);
		s.push({ type: 'playback_changed', status: 'idle' });
		s.push({ type: 'playback_changed', status: 'playing' });
		clock += 30_000;
		s.push({ type: 'volume_changed', volume: 95 });
		expect(s.sent).toHaveLength(1); // only the idle → playing edge, inside its window
	});

	it('does not touch the volume when chota connects mid-song', () => {
		client(60);
		const s = online({ status: 'playing', volume: 90 });
		expect(s.sent).toEqual([]);
	});
});

describe('interrupt', () => {
	it('pauses, runs fn, then resumes when it was playing', async () => {
		const c = client();
		const s = online({ status: 'playing', item: TRACK });
		const order: string[] = [];
		const done = c.interrupt(async () => {
			order.push('announce');
			return 'said';
		});
		expect(s.ack()).toMatchObject({ command: 'pause' });
		await vi.advanceTimersByTimeAsync(0);
		s.push({ type: 'playback_changed', status: 'paused' });
		await vi.advanceTimersByTimeAsync(0);
		expect(order).toEqual(['announce']);
		expect(s.ack()).toMatchObject({ command: 'play' });
		await expect(done).resolves.toBe('said');
		expect(s.sent.map((m) => m.command)).toEqual(['pause', 'play']);
	});

	it('resumes even when fn throws', async () => {
		const c = client();
		const s = online({ status: 'playing', item: TRACK });
		const done = c.interrupt(() => Promise.reject(new Error('chime failed')));
		const caught = done.catch((e: Error) => e.message);
		s.ack();
		await vi.advanceTimersByTimeAsync(0);
		s.push({ type: 'playback_changed', status: 'paused' });
		await vi.advanceTimersByTimeAsync(0);
		s.ack();
		expect(await caught).toBe('chime failed');
		expect(s.sent.map((m) => m.command)).toEqual(['pause', 'play']);
	});

	it('still runs fn when the speaker dropped mid-song, or the pause fails', async () => {
		const c = client();
		const s = online({ status: 'playing', item: TRACK });
		const p = c.interrupt(() => 'a');
		s.push({ type: 'error', message: 'command requires authentication' });
		await expect(p).resolves.toBe('a');
		expect(s.sent.map((m) => m.command)).toEqual(['pause']); // no resume after a failed pause
		s.drop();
		expect(c.nowPlaying()).toMatchObject({ speaker: 'offline', status: 'idle', track: null });
		await expect(c.interrupt(() => 42)).resolves.toBe(42);
	});

	it('just runs fn when nothing is playing', async () => {
		const c = client();
		const s = online({ status: 'paused', item: TRACK });
		await expect(c.interrupt(() => 42)).resolves.toBe(42);
		expect(s.sent).toEqual([]);
	});
});

describe('reconnect', () => {
	it('reconnects with backoff after the server drops, and stops on stop()', async () => {
		const c = client();
		online();
		sockets[0].drop();
		expect(c.nowPlaying().speaker).toBe('offline');
		await vi.advanceTimersByTimeAsync(1000);
		expect(sockets).toHaveLength(2);
		sockets[1].drop(); // never opened: still offline, next wait doubles
		await vi.advanceTimersByTimeAsync(1999);
		expect(sockets).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(1);
		expect(sockets).toHaveLength(3);
		online();
		expect(c.nowPlaying().speaker).toBe('online');
		c.stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(sockets).toHaveLength(3);
	});

	it('fails pending commands when the socket drops', async () => {
		const c = client();
		const s = online();
		const p = c.pause();
		s.drop();
		await expect(p).rejects.toThrow('speaker offline');
	});
});
