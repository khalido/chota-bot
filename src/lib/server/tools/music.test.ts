// The home-backed house speaker against a fake Soloist socket. What is tested
// is chota's own rule (music on another device is left alone); the connector's
// socket handling, cap and confirmations are @khalido/home's and tested there.
import { afterEach, describe, expect, it } from 'vitest';
import { createMusic, MusicError, type Music } from './music';

class FakeSoloist {
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
	/** Commands that change something (not the connector's own get_* queries). */
	writes() {
		return this.sent.map((m) => String(m.command)).filter((c) => !c.startsWith('get_'));
	}
}

const song = {
	uri: 'spotify:track:0000000000000000000001',
	entity_type: 'track',
	decorations: { identity: { name: 'A Song' }, playback: { duration_ms: 200_000 } }
};
const tick = () => new Promise((r) => setTimeout(r, 5));
/** The connector queues writes behind its own queries, so wait for one to go out. */
async function firstWrite(of: FakeSoloist): Promise<string | undefined> {
	for (let i = 0; i < 400 && of.writes().length === 0; i++) await tick();
	return of.writes()[0];
}

let music: Music;
let socket: FakeSoloist;

/** A started client whose Soloist reports `status`, active on this box or not. */
async function speaker(status: string, active: boolean, loggedIn = true) {
	socket = new FakeSoloist();
	music = createMusic({ maxVolume: 60, connect: () => socket });
	music.start();
	await tick();
	socket.open();
	socket.push({ type: 'auth_state', logged_in: loggedIn, is_active: active, device_name: 'Chota' });
	if (loggedIn)
		socket.push({ type: 'playback_state', status, item: song, volume: 40, is_active: active });
	await tick();
}

afterEach(() => music?.stop());

describe('nowPlaying', () => {
	it('is offline before Soloist answers', () => {
		socket = new FakeSoloist();
		music = createMusic({ connect: () => socket });
		music.start();
		expect(music.nowPlaying()).toMatchObject({ speaker: 'offline', here: false, track: null });
	});

	it('is waiting when nobody is signed in', async () => {
		await speaker('idle', false, false);
		expect(music.nowPlaying().speaker).toBe('waiting');
	});

	it('says the music is here when this speaker is the active device', async () => {
		await speaker('playing', true);
		expect(music.nowPlaying()).toMatchObject({
			speaker: 'online',
			here: true,
			status: 'playing',
			deviceName: 'Chota',
			volume: 40,
			track: { name: 'A Song', durationMs: 200_000 }
		});
	});

	it('says the music is not here when the account plays on another device', async () => {
		await speaker('playing', false);
		expect(music.nowPlaying()).toMatchObject({ speaker: 'online', here: false, status: 'playing' });
	});
});

describe('music on another device is left alone', () => {
	it.each(['pause', 'next', 'prev', 'resume'] as const)(
		'%s is refused, nothing sent',
		async (verb) => {
			await speaker('playing', false);
			await expect(music[verb]()).rejects.toThrow(/another speaker/);
			expect(socket.writes()).toEqual([]);
		}
	);

	it('a volume change is refused, nothing sent', async () => {
		await speaker('playing', false);
		await expect(music.setVolume(20)).rejects.toBeInstanceOf(MusicError);
		expect(socket.writes()).toEqual([]);
	});

	it.each(['interrupt', 'duck'] as const)(
		'%s runs the announcement over it and sends nothing',
		async (aside) => {
			await speaker('playing', false);
			const said = aside === 'duck' ? music.duck(() => 'said', 20) : music.interrupt(() => 'said');
			expect(await said).toEqual({ value: 'said', music: 'untouched' });
			expect(socket.writes()).toEqual([]);
		}
	);

	it('pause with nothing playing here says so, nothing sent', async () => {
		await speaker('paused', false);
		await expect(music.pause()).rejects.toThrow(/nothing is playing on the house speaker/);
		expect(socket.writes()).toEqual([]);
	});

	it('an explicit play is sent: that is how the music moves to the house speaker', async () => {
		await speaker('playing', false);
		const playing = music.play('spotify:album:0000000000000000000002').catch((e) => e);
		expect(await firstWrite(socket)).toBe('activate');
		music.stop();
		await playing;
	});
});

describe('writes on this speaker', () => {
	it('pause is sent when the music is here', async () => {
		await speaker('playing', true);
		const done = music.pause().catch((e) => e);
		expect(await firstWrite(socket)).toBe('pause');
		music.stop();
		await done;
	});

	it('refuses something that is not a Spotify link without sending it', async () => {
		await speaker('playing', true);
		await expect(music.play('some song please')).rejects.toThrow(/not a Spotify link/);
		expect(socket.writes()).toEqual([]);
	});
});
