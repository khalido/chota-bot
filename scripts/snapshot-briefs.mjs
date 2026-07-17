#!/usr/bin/env node
/**
 * Snapshot each recipient's print page to a PNG using the agent-browser CLI.
 *
 * This is the prototype of the "designed print" path: instead of redrawing the
 * brief on a server-side canvas, we render the real `<BriefSheet>` HTML at the
 * 576px thermal-head width in a headless browser and screenshot it. The PNG can
 * then be fed straight to the printer's `printImageBuffer()`.
 *
 * `?bare=1` drops the dashboard nav, so the page is just the white sheet.
 *
 * Prereqs:
 *   npm i -g agent-browser && agent-browser install   (one-time)
 *   dev server running on the base URL (default http://localhost:8000)
 *
 * Usage:
 *   node scripts/snapshot-briefs.mjs                  # all configured recipients (family + every kid with a Sentral cookie)
 *   node scripts/snapshot-briefs.mjs <kid>            # just one
 *   CHOTA_URL=http://localhost:5174 node scripts/snapshot-briefs.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = (process.env.CHOTA_URL ?? 'http://localhost:8000').replace(/\/$/, '');
const WIDTH = 576; // MUNBYN 80mm print head, 203dpi
const OUT_DIR = join(process.cwd(), 'data', 'morning');

// Mirrors `configuredSentralKids()` in src/lib/server/tools/sentral.ts — every
// `SENTRAL_<NAME>_COOKIE` env line implies a kid the morning print includes.
// We grep .env directly so this script needs no SvelteKit resolution.
function configuredKids() {
	if (!existsSync('.env')) return [];
	const text = readFileSync('.env', 'utf8');
	const names = new Set();
	for (const line of text.split('\n')) {
		const m = /^SENTRAL_([A-Z]+)_COOKIE\s*=\s*"?(.+?)"?\s*$/.exec(line.trim());
		if (m && m[2] && m[2] !== '""' && m[2] !== "''") names.add(m[1].toLowerCase());
	}
	return [...names];
}

const argWho = process.argv.slice(2).filter(Boolean);
const recipients = argWho.length ? argWho : ['family', ...configuredKids()];

function ab(args, { capture = false } = {}) {
	return execFileSync('agent-browser', args, {
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
	});
}

// Fail fast on the obvious "I forgot the dev server" / "no agent-browser" cases.
try {
	ab(['--version'], { capture: true });
} catch {
	console.error(
		'agent-browser not found. Install it: npm i -g agent-browser && agent-browser install'
	);
	process.exit(1);
}
try {
	// Dev-server SSR of /print can be slow (cold compile + tool fetches), so be generous.
	const res = await fetch(`${BASE}/print`, { signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
	console.error(
		`Can't reach ${BASE} — is the dev server running? (${e instanceof Error ? e.message : e})`
	);
	console.error('Set CHOTA_URL to point elsewhere.');
	process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const r of recipients) {
	const url = `${BASE}/print/${r}?bare=1`;
	const out = join(OUT_DIR, `brief-${r}.png`);
	console.log(`\n→ ${url}`);

	ab(['set', 'viewport', String(WIDTH), '900']);
	ab(['open', url]);
	ab(['wait', '--load', 'networkidle']);

	// `screenshot --full` does NOT grow the viewport past its set height, so
	// measure the rendered sheet and resize before capturing.
	const h = parseInt(
		String(ab(['eval', 'document.documentElement.scrollHeight'], { capture: true })).trim(),
		10
	);
	const height = Number.isFinite(h) && h > 0 ? h + 8 : 1600;
	ab(['set', 'viewport', String(WIDTH), String(height)]);
	ab(['wait', '200']);
	ab(['screenshot', '--full', out]);

	console.log(`  ${out}  (${WIDTH}×${height})`);
	written.push(out);
}

ab(['close']);
console.log(`\nDone. ${written.length} snapshot${written.length === 1 ? '' : 's'}:`);
for (const p of written) console.log(`  ${p}`);
