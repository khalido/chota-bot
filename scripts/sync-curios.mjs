#!/usr/bin/env node
/**
 * Refresh both vendored content files from the curios content repo
 * (`khalido/curios`) in one shot:
 *
 *   data/quotes/literary.json    ← curios/dist/clock-quotes.json
 *   data/puzzles/puzzles.json    ← curios/dist/puzzles.json
 *
 * Defaults to the local sibling checkout (`../curios/dist/`); pass a URL
 * or directory to override. Pulls fresh content + shape-checks the
 * first entry before writing each file — failures bail without
 * touching the existing on-disk copy.
 *
 *   node scripts/sync-curios.mjs                          # local sibling
 *   node scripts/sync-curios.mjs https://raw.githubusercontent.com/khalido/curios/main/dist
 *   npm run sync                                          # alias for the local form
 *
 * Updates are infrequent — run when curios has new content. The output
 * files are tracked in git (deterministic, content-versioned), so the
 * usual flow is: sync → eyeball the diff → commit → deploy.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = resolve(REPO_ROOT, '../curios/dist');

// First arg overrides — pass a base URL/dir; filenames are appended below.
const BASE = process.argv[2] || DEFAULT_BASE;
const isUrl = /^https?:\/\//i.test(BASE);

async function read(name) {
	if (isUrl) {
		const url = `${BASE.replace(/\/$/, '')}/${name}`;
		const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
		if (!r.ok) throw new Error(`fetch ${url} → ${r.status}`);
		return r.text();
	}
	return readFile(resolve(BASE, name), 'utf8');
}

async function write(rel, content) {
	const dest = resolve(REPO_ROOT, rel);
	await mkdir(dirname(dest), { recursive: true });
	await writeFile(dest, content);
	return dest.replace(REPO_ROOT, '.');
}

// ── quotes ──────────────────────────────────────────────────────────────
async function syncQuotes() {
	const raw = await read('clock-quotes.json');
	const quotes = JSON.parse(raw);
	const keys = Object.keys(quotes);
	const HHMM = /^\d{2}:\d{2}$/;
	const bad = keys.filter((k) => !HHMM.test(k));
	if (bad.length) {
		throw new Error(`quotes: expected HH:MM keys, found ${bad.slice(0, 3).join(', ')}…`);
	}
	const sample = quotes[keys[0]][0];
	if (!sample?.quote || !sample.title || !sample.author) {
		throw new Error(
			`quotes: expected {quote,title,author}, got: ${JSON.stringify(sample).slice(0, 120)}`
		);
	}
	const total = keys.reduce((n, k) => n + quotes[k].length, 0);
	const dest = await write('data/quotes/literary.json', JSON.stringify(quotes, null, '\t'));
	console.log(`✓ quotes:   ${keys.length} minutes, ${total} entries  →  ${dest}`);
}

// ── puzzles ─────────────────────────────────────────────────────────────
async function syncPuzzles() {
	const raw = await read('puzzles.json');
	const puzzles = JSON.parse(raw);
	if (!Array.isArray(puzzles) || puzzles.length === 0) {
		throw new Error(`puzzles: expected non-empty array, got ${typeof puzzles}`);
	}
	const required = ['question', 'answer', 'category', 'rating', 'source'];
	const missing = required.filter((k) => !(k in puzzles[0]));
	if (missing.length) {
		throw new Error(
			`puzzles[0] missing ${missing.join(', ')} — keys present: ${Object.keys(puzzles[0]).join(', ')}`
		);
	}
	const ratings = ['kids', 'family', 'mature', 'unrated']
		.map((r) => `${r}=${puzzles.filter((p) => p.rating === r).length}`)
		.join(' · ');
	const dest = await write('data/puzzles/puzzles.json', JSON.stringify(puzzles, null, '\t') + '\n');
	console.log(`✓ puzzles:  ${puzzles.length} entries (${ratings})  →  ${dest}`);
}

console.log(`source: ${BASE}`);
await syncQuotes();
await syncPuzzles();
