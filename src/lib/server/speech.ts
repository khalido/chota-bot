/**
 * Speech out: text → audio through an AI Gateway speech model → the box's
 * speaker through PipeWire (docs/audio.md). The counterpart of transcribe.ts.
 *
 *   await speak("Volleyball's at half five, so leave by quarter to.");
 *   await speak(line, { mood: 'cheerful, it is Friday' });
 *
 * The clip is made first, then the music (Soloist, if `music` is configured)
 * is turned down (or paused, for an important announcement), a short chime
 * plays to wake the speaker, the clip plays at `speech.volume`, and the music
 * is put back. Clips are kept under `data/speech/`
 * by a hash of model, voice, directions and text, so a fixed phrase is paid
 * for once. One thing is said at a time. During `speech.quietHours` it refuses.
 *
 * Personality: the words come from whoever wrote them (the agent, with its
 * soul; or a job's fixed text). How they sound is `speech.style`, plus a
 * per-call `mood`, sent as the model's `instructions`; models that ignore
 * directions just read the words.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSpeech } from 'ai';
import { getConfig } from '#lib/server/config.ts';
import { inQuietHours } from '#lib/server/alerts.ts';
import { log, logErr } from '#lib/server/log.ts';
import { houseSpeaker } from '#lib/server/tools/music.ts';
import { sydneyHHMM } from '#lib/time.ts';

const SCOPE = 'speech';
const DIR = 'data/speech';
/** The longest thing chota will say in one go (~30 s of speech). */
export const MAX_CHARS = 400;
const PLAY_TIMEOUT_MS = 90_000;

export class SpeechRefused extends Error {}

/** The model's directions: chota's standing style, then this call's mood. */
export function directions(style?: string, mood?: string): string | undefined {
	const parts = [style, mood].map((s) => s?.trim()).filter(Boolean);
	return parts.length ? parts.join(' ') : undefined;
}

/** Where a clip is kept: the same model, voice, directions and words share one file. */
export function clipPath(
	model: string,
	voice: string | undefined,
	how: string | undefined,
	text: string
) {
	const key = createHash('sha256')
		.update([model, voice ?? '', how ?? '', text].join('\u0000'))
		.digest('hex')
		.slice(0, 20);
	return join(DIR, `${key}.wav`);
}

/** A two-note chime as a 16-bit mono WAV: wakes the speaker and says "listen". */
export function chimeWav(rate = 24_000): Uint8Array {
	const notes = [
		{ hz: 659.25, s: 0.16 },
		{ hz: 987.77, s: 0.32 }
	];
	const samples: number[] = [];
	for (const { hz, s } of notes) {
		const n = Math.round(rate * s);
		for (let i = 0; i < n; i++) {
			const fade = Math.min(1, i / (rate * 0.01), (n - i) / (rate * 0.12));
			samples.push(Math.sin((2 * Math.PI * hz * i) / rate) * 0.35 * fade);
		}
	}
	const data = samples.length * 2;
	const buf = Buffer.alloc(44 + data);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + data, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20); // PCM
	buf.writeUInt16LE(1, 22); // mono
	buf.writeUInt32LE(rate, 24);
	buf.writeUInt32LE(rate * 2, 28);
	buf.writeUInt16LE(2, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(data, 40);
	samples.forEach((v, i) => buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2));
	return new Uint8Array(buf);
}

/** Make (or reuse) the clip for `text`; returns its path. */
async function clip(text: string, mood?: string): Promise<{ path: string; cached: boolean }> {
	const cfg = getConfig().speech!;
	const how = directions(cfg.style, mood);
	const path = clipPath(cfg.model, cfg.voice, how, text);
	if (existsSync(path)) return { path, cached: true };
	const started = Date.now();
	const { audio, warnings } = await generateSpeech({
		model: cfg.model,
		text,
		voice: cfg.voice,
		instructions: how,
		outputFormat: 'wav',
		abortSignal: AbortSignal.timeout(60_000)
	});
	// A model that ignores `voice` or `instructions` (the style) says so here.
	if (warnings.length) log(SCOPE, `${cfg.model} warnings: ${JSON.stringify(warnings)}`);
	if (audio.mediaType !== 'audio/wav')
		throw new Error(`${cfg.model} sent ${audio.mediaType}, not WAV`);
	await mkdir(DIR, { recursive: true });
	await writeFile(path, audio.uint8Array);
	log(
		SCOPE,
		`${cfg.model}: ${text.length} chars → ${audio.uint8Array.length} bytes in ${Date.now() - started}ms`
	);
	return { path, cached: false };
}

async function chimePath(): Promise<string> {
	const path = join(DIR, 'chime.wav');
	if (!existsSync(path)) {
		await mkdir(DIR, { recursive: true });
		await writeFile(path, chimeWav());
	}
	return path;
}

/** Play a file on the default output at `volume` (0–1). chota runs as a system
 *  service, so it points PipeWire at ko's session itself. */
export function play(path: string, volume: number): Promise<void> {
	const env = { ...process.env };
	env.XDG_RUNTIME_DIR ??= `/run/user/${process.getuid?.() ?? 1000}`;
	return new Promise((resolve, reject) => {
		execFile(
			'pw-play',
			// Without restore-props off, WirePlumber saves this volume for the Music
			// role and every later Spotify stream starts at it.
			['-P', '{ state.restore-props = false }', '--volume', String(volume), path],
			{ env, timeout: PLAY_TIMEOUT_MS },
			(error, _out, stderr) =>
				error ? reject(new Error(`pw-play: ${stderr.trim() || error.message}`)) : resolve()
		);
	});
}

/** Why chota can't speak right now, or undefined if it can. */
export function cannotSpeak(now = new Date()): string | undefined {
	const cfg = getConfig().speech;
	if (!cfg) return 'speech is off (no `speech` in the config)';
	if (inQuietHours(sydneyHHMM(now), cfg.quietHours))
		return `it's quiet hours (${cfg.quietHours!.from}–${cfg.quietHours!.to})`;
	return undefined;
}

let queue: Promise<unknown> = Promise.resolve();

/** Where the music is turned down to around a regular announcement (0–100). */
const DUCK_TO = 20;

/**
 * Say `text` on the speaker. Throws SpeechRefused when speech is off or it's
 * quiet hours; other errors are real failures.
 *
 * The music on the house speaker (KO, 10 Nov 2026): a regular announcement is
 * spoken over it with the music turned down, then put back; an `important` one
 * pauses it. Music playing on another device is never touched (tools/music.ts).
 */
export async function speak(
	text: string,
	opts: { mood?: string; chime?: boolean; important?: boolean } = {}
): Promise<{ cached: boolean; ms: number }> {
	const why = cannotSpeak();
	if (why) throw new SpeechRefused(why);
	const words = text.trim();
	if (!words) throw new Error('nothing to say');
	if (words.length > MAX_CHARS)
		throw new Error(`too long to say (${words.length} > ${MAX_CHARS} characters)`);

	const run = async () => {
		const started = Date.now();
		const { path, cached } = await clip(words, opts.mood);
		const volume = getConfig().speech!.volume;
		const out = async () => {
			if (opts.chime !== false) await play(await chimePath(), volume);
			await play(path, volume);
		};
		if (!getConfig().music) await out();
		else {
			const aside = opts.important
				? await houseSpeaker().interrupt(out)
				: await houseSpeaker().duck(out, getConfig().speech!.duckTo ?? DUCK_TO);
			// 'failed' or 'kept': the music may be left quiet or paused. Say so.
			if (aside.music !== 'restored' && aside.music !== 'untouched') {
				const why = 'why' in aside && aside.why ? `: ${aside.why}` : '';
				logErr(SCOPE, `music ${aside.music} after an announcement${why}`);
			}
		}
		const ms = Date.now() - started;
		log(SCOPE, `said ${words.length} chars${cached ? ' (cached)' : ''} in ${ms}ms`);
		return { cached, ms };
	};
	const next = queue.then(run, run);
	queue = next.catch(() => {});
	return next;
}
