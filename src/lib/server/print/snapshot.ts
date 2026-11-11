/**
 * The "designed print" path: instead of redrawing the brief on a server-side
 * canvas, screenshot the real `<BriefSheet>` HTML at the 576px thermal-head
 * width via the agent-browser CLI. The PNG goes straight to the printer's
 * `printImageBuffer()`, so the printout is pixel-identical to the `/print/<who>`
 * preview.
 *
 * The /print/<who> route is rendered bare by the layout — no nav, no
 * dashboard chrome — so the page is just the white sheet at the
 * 576px-wide viewport. (Layout's nav-hide is gated on pathname, not a
 * query flag.)
 *
 * Requires `agent-browser` on PATH with its browser installed
 * (`npm i -g agent-browser && agent-browser install`). If it's missing or
 * fails, this throws — callers fall back to the canvas renderer (see
 * `composeImage` in composers.ts).
 *
 * Calls are serialized process-wide through `withBrowser()`: agent-browser
 * drives one shared headless browser, so concurrent screenshots — or a
 * screenshot overlapping the Sentral SAML login — would clobber each other.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PORT } from '$app/env/private';
import { withBrowser } from '#lib/server/browser-lock.ts';
import { log } from '#lib/server/log.ts';

const exec = promisify(execFile);
const WIDTH = 576; // MUNBYN 80mm print head @ 203dpi
const CMD_TIMEOUT_MS = 35_000;

/** This server on loopback. Never `ORIGIN`: that is the sign-in origin, and a
 *  screenshot sent through it would leave the box or hit a login. `localhost`
 *  rather than 127.0.0.1: the dev server binds one address, and on a Mac that
 *  is ::1. */
function baseUrl(): string {
	return `http://localhost:${PORT || 8000}`;
}

/** Thrown when the page that loaded isn't the brief (a 500, a 404, a login). */
export class NotTheBrief extends Error {}

/**
 * Screenshot `/print/<who>` → PNG bytes. Throws if agent-browser is
 * unusable. `date` (YYYY-MM-DD) overrides the school-timetable day; `day:
 * 'tomorrow'` renders the whole brief one day ahead (the evening print).
 */
export function briefToPng(
	who: string,
	date?: string,
	day: 'today' | 'tomorrow' = 'today'
): Promise<Buffer> {
	return withBrowser(() => snapshot(who, date, day));
}

async function snapshot(
	who: string,
	date?: string,
	day: 'today' | 'tomorrow' = 'today'
): Promise<Buffer> {
	const params = new URLSearchParams();
	if (date) params.set('date', date);
	if (day === 'tomorrow') params.set('day', 'tomorrow');
	const qs = params.toString();
	const url = `${baseUrl()}/print/${encodeURIComponent(who)}${qs ? `?${qs}` : ''}`;
	const out = join(tmpdir(), `chota-brief-${who}-${process.pid}-${Date.now()}.png`);
	const ab = (args: string[]) => exec('agent-browser', args, { timeout: CMD_TIMEOUT_MS });

	try {
		return await capture(ab, url, who, out);
	} finally {
		// Left open, Chromium sat in memory between prints (Sentral's login closes it too).
		await ab(['close']).catch(() => {});
	}
}

async function capture(
	ab: (args: string[]) => Promise<{ stdout: string | Buffer }>,
	url: string,
	who: string,
	out: string
): Promise<Buffer> {
	await ab(['set', 'viewport', String(WIDTH), '900']);
	await ab(['open', url]);
	await ab(['wait', '--load', 'networkidle']);

	// The browser screenshots whatever loaded. Without this check an error page
	// was captured, printed as the brief and reported ok.
	const seen = await ab([
		'eval',
		"document.querySelector('[data-brief-sheet]') ? 'brief-sheet-ok' : 'not-brief: ' + document.title"
	]);
	if (!String(seen.stdout).includes('brief-sheet-ok')) {
		throw new NotTheBrief(
			`/print/${who} did not render the brief (${String(seen.stdout).trim().slice(0, 120)})`
		);
	}

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
