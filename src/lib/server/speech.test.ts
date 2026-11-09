import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg: { speech?: Record<string, unknown>; music?: object } = {};
vi.mock('$lib/server/config', () => ({ getConfig: () => cfg }));
vi.mock('$lib/server/log', () => import('$lib/server/log.mock'));

const generateSpeech = vi.fn();
vi.mock('ai', () => ({ generateSpeech: (o: unknown) => generateSpeech(o) }));

const played: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
vi.mock('node:child_process', () => ({
	execFile: (
		_cmd: string,
		args: string[],
		opts: { env: NodeJS.ProcessEnv },
		cb: (e: null, o: string, s: string) => void
	) => {
		played.push({ args, env: opts.env });
		cb(null, '', '');
	}
}));

const interrupt = vi.fn(async (fn: () => Promise<unknown>) => fn());
vi.mock('$lib/server/tools/spotify', () => ({ soloist: () => ({ interrupt }) }));

const { chimeWav, clipPath, directions, cannotSpeak, speak, SpeechRefused } =
	await import('./speech');

const wav = { mediaType: 'audio/wav', uint8Array: new Uint8Array([82, 73, 70, 70]) };
const NOON = new Date('2026-11-08T01:00:00Z'); // 12:00 Sydney

beforeEach(() => {
	cfg.speech = {
		model: 'test/tts',
		voice: 'V',
		style: 'warm',
		volume: 0.55,
		quietHours: { from: '21:00', to: '07:00' }
	};
	delete cfg.music;
	generateSpeech.mockReset().mockResolvedValue({ audio: wav, warnings: [] });
	interrupt.mockClear();
	played.length = 0;
});

describe('chimeWav', () => {
	it('is a mono 16-bit PCM WAV with a matching data size', () => {
		const b = Buffer.from(chimeWav(24_000));
		expect(b.toString('ascii', 0, 4)).toBe('RIFF');
		expect(b.toString('ascii', 8, 12)).toBe('WAVE');
		expect(b.readUInt16LE(22)).toBe(1);
		expect(b.readUInt32LE(24)).toBe(24_000);
		expect(b.readUInt16LE(34)).toBe(16);
		expect(b.readUInt32LE(40)).toBe(b.length - 44);
		expect(b.length - 44).toBe(Math.round(24_000 * 0.16) * 2 + Math.round(24_000 * 0.32) * 2);
	});
});

describe('clipPath and directions', () => {
	it('is stable for the same words and changes with any input', () => {
		const a = clipPath('m', 'v', 'warm', 'hello');
		expect(clipPath('m', 'v', 'warm', 'hello')).toBe(a);
		expect(clipPath('m', 'v', 'warm', 'hello!')).not.toBe(a);
		expect(clipPath('m', 'w', 'warm', 'hello')).not.toBe(a);
		expect(clipPath('m', 'v', 'cold', 'hello')).not.toBe(a);
		expect(a).toMatch(/^data\/speech\/[0-9a-f]{20}\.wav$/);
	});
	it('joins style and mood, skipping blanks', () => {
		expect(directions('warm', 'brisk')).toBe('warm brisk');
		expect(directions('warm', ' ')).toBe('warm');
		expect(directions(undefined, undefined)).toBeUndefined();
	});
});

describe('cannotSpeak', () => {
	it('is off without config, quiet at night, fine at noon', () => {
		expect(cannotSpeak(NOON)).toBeUndefined();
		expect(cannotSpeak(new Date('2026-11-08T12:00:00Z'))).toMatch(/quiet hours/); // 23:00 Sydney
		delete cfg.speech;
		expect(cannotSpeak(NOON)).toMatch(/off/);
	});
});

describe('speak', () => {
	beforeEach(() => vi.useFakeTimers({ now: NOON, toFake: ['Date'] }));

	it('makes the clip once, then plays the chime and the clip at the configured volume', async () => {
		const words = `test line ${Math.random()}`;
		const first = await speak(words, { mood: 'brisk' });
		expect(first.cached).toBe(false);
		expect(generateSpeech).toHaveBeenCalledWith(
			expect.objectContaining({
				model: 'test/tts',
				text: words,
				voice: 'V',
				instructions: 'warm brisk',
				outputFormat: 'wav'
			})
		);
		expect(played.map((p) => p.args.slice(0, 4).join(' '))).toEqual([
			'-P { state.restore-props = false } --volume 0.55',
			'-P { state.restore-props = false } --volume 0.55'
		]);
		expect(played[0].args[4]).toMatch(/chime\.wav$/);
		expect(played[1].env.XDG_RUNTIME_DIR).toBeTruthy();

		const again = await speak(words, { mood: 'brisk' });
		expect(again.cached).toBe(true);
		expect(generateSpeech).toHaveBeenCalledTimes(1);
	});

	it('pauses the music around it when music is configured, and can skip the chime', async () => {
		cfg.music = {};
		await speak(`another ${Math.random()}`, { chime: false });
		expect(interrupt).toHaveBeenCalledTimes(1);
		expect(played).toHaveLength(1);
	});

	it('refuses in quiet hours and when off, without calling the model', async () => {
		vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
		await expect(speak('hi')).rejects.toBeInstanceOf(SpeechRefused);
		expect(generateSpeech).not.toHaveBeenCalled();
	});

	it('rejects audio that is not WAV', async () => {
		generateSpeech.mockResolvedValue({
			audio: { mediaType: 'audio/mpeg', uint8Array: new Uint8Array(1) },
			warnings: []
		});
		await expect(speak(`mp3 ${Math.random()}`)).rejects.toThrow(/not WAV/);
		expect(played).toHaveLength(0);
	});
});
