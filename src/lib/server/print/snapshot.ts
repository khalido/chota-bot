/**
 * The "designed print" path: instead of redrawing the brief on a server-side
 * canvas, screenshot the real `<BriefSheet>` HTML at the 576px thermal-head
 * width via the agent-browser CLI. The PNG goes straight to the printer's
 * `printImageBuffer()`, so the printout is pixel-identical to the `/print/<who>`
 * preview.
 *
 * `?bare=1` drops the dashboard nav so the page is just the white sheet, and
 * the viewport is sized to the rendered sheet — no surrounding whitespace.
 *
 * Requires `agent-browser` on PATH with its browser installed
 * (`npm i -g agent-browser && agent-browser install`). If it's missing or
 * fails, this throws — callers fall back to the canvas renderer (see
 * `composeImage` in composers.ts).
 *
 * Calls are serialized process-wide: agent-browser drives one shared headless
 * browser, so concurrent screenshots would clobber each other's viewport.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/log';

const exec = promisify(execFile);
const WIDTH = 576; // MUNBYN 80mm print head @ 203dpi
const CMD_TIMEOUT_MS = 30_000;

function baseUrl(): string {
	return (env.ORIGIN || `http://localhost:${env.PORT || 8000}`).replace(/\/$/, '');
}

let chain: Promise<unknown> = Promise.resolve();

/** Screenshot `/print/<who>?bare=1` → PNG bytes. Throws if agent-browser is unusable. */
export function briefToPng(who: string): Promise<Buffer> {
	const run = chain.then(() => snapshot(who));
	chain = run.catch(() => {});
	return run;
}

async function snapshot(who: string): Promise<Buffer> {
	const url = `${baseUrl()}/print/${encodeURIComponent(who)}?bare=1`;
	const out = join(tmpdir(), `chota-brief-${who}-${process.pid}-${Date.now()}.png`);
	const ab = (args: string[]) => exec('agent-browser', args, { timeout: CMD_TIMEOUT_MS });

	await ab(['set', 'viewport', String(WIDTH), '900']);
	await ab(['open', url]);
	await ab(['wait', '--load', 'networkidle']);

	// `screenshot --full` doesn't grow the viewport past its set height, so
	// measure the rendered sheet and resize to fit before capturing.
	const { stdout } = await ab(['eval', 'document.documentElement.scrollHeight']);
	const h = parseInt(String(stdout).trim(), 10);
	const height = Number.isFinite(h) && h > 0 ? h + 2 : 1600;
	await ab(['set', 'viewport', String(WIDTH), String(height)]);
	await ab(['screenshot', '--full', out]);

	try {
		const buf = await readFile(out);
		log('print', `screenshot /print/${who} → ${buf.length}b (${WIDTH}×${height})`);
		return buf;
	} finally {
		await unlink(out).catch(() => {});
	}
}
