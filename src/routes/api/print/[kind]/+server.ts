import { error, json } from '@sveltejs/kit';
import { composeText, composeImage } from '$lib/server/print/composers';
import { printText, printPng } from '$lib/server/print/printer';
import { logErr } from '$lib/server/log';
import type { RequestHandler } from './$types';

/**
 * GET  /api/print/{kind}              → plain text (browser preview)
 * GET  /api/print/{kind}?format=png   → the designed PNG (screenshot of /print/{kind}, canvas fallback)
 * POST /api/print/{kind}              → print plain text + cut         (?font=b for Font B, ?mix=1 mixed)
 * POST /api/print/{kind}?mode=image   → print the designed PNG + cut
 *
 * Kinds: `test` (ruler sheet), `morning` (alias for `family`), and any recipient
 * returned by `getRecipients()` — `family` plus every kid with a Sentral cookie.
 */

export const GET: RequestHandler = async ({ params, url }) => {
	if (url.searchParams.get('format') === 'png') {
		const composed = await composeImage(params.kind);
		if (composed === null) throw error(404, `Unknown print kind: ${params.kind}`);
		return new Response(new Uint8Array(composed.image), {
			headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }
		});
	}

	const text = await composeText(params.kind);
	if (text === null) throw error(404, `Unknown print kind: ${params.kind}`);
	return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
};

export const POST: RequestHandler = async ({ params, url }) => {
	const mode = url.searchParams.get('mode') === 'image' ? 'image' : 'text';

	// Build the payload first (a missing-kind 404 shouldn't look like a printer error).
	const composed = mode === 'image' ? await composeImage(params.kind) : null;
	const text = mode === 'image' ? null : await composeText(params.kind);
	if ((mode === 'image' && composed === null) || (mode === 'text' && text === null)) {
		throw error(404, `Unknown print kind: ${params.kind}`);
	}

	try {
		let bytes: number;
		if (composed) {
			bytes = await printPng(composed.image);
		} else if (url.searchParams.get('mix') === '1') {
			bytes = await printText(text!, { mix: true });
		} else {
			bytes = await printText(text!, { font: url.searchParams.get('font') === 'b' ? 'B' : 'A' });
		}
		// `lines` only meaningful for text mode; null for image (no notion of lines in raster).
		const lines = mode === 'text' && text ? text.split('\n').length : null;
		return json({ ok: true, kind: params.kind, mode, bytes, lines, fallback: composed?.fallback });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logErr('print', `${params.kind} (${mode}) print failed:`, err);
		return json({ ok: false, kind: params.kind, mode, error: message }, { status: 500 });
	}
};
