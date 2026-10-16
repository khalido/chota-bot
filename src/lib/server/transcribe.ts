/**
 * Voice notes → text, through AI Gateway (Gemini's transcription model).
 * WhatsApp voice notes are Ogg/Opus; the model takes the bytes as they are.
 */
import { gateway, transcribe } from 'ai';
import { log } from '$lib/server/log';

const MODEL = 'google/gemini-3.5-transcribe';

export async function transcribeAudio(audio: Buffer): Promise<string> {
	const started = Date.now();
	const result = await transcribe({
		model: gateway.transcriptionModel(MODEL),
		audio,
		abortSignal: AbortSignal.timeout(60_000)
	});
	const text = result.text.trim();
	log(
		'transcribe',
		`${result.durationInSeconds?.toFixed(0) ?? '?'}s of audio → ${text.length} chars in ${Date.now() - started}ms`
	);
	return text;
}
