#!/usr/bin/env node
/**
 * Refresh `data/puzzles/puzzles.json` from the curios content repo.
 * Same pattern as `sync-quotes.mjs` — manual run when you've updated
 * curios; commit the resulting JSON.
 *
 * Default source is the sibling `~/code/curios/dist/puzzles.json` on
 * the dev Mac. Pass a URL (or any path) to override:
 *
 *   node scripts/sync-puzzles.mjs    # from local sibling curios checkout
 *   node scripts/sync-puzzles.mjs https://raw.githubusercontent.com/khalido/curios/main/dist/puzzles.json
 *
 * Future "build-time grab": a `prebuild` hook in package.json that
 * calls this with the GitHub URL would pull the latest puzzles every
 * deploy. Not wired today (would create dirty-tree drift between
 * deploys vs. git pulls); revisit if curios updates outpace manual
 * sync.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = resolve(REPO_ROOT, '../curios/dist/puzzles.json');
const DEST = resolve(REPO_ROOT, 'data/puzzles/puzzles.json');

// First arg overrides the source — pass a URL or a local file path.
const SOURCE = process.argv[2] || DEFAULT_SOURCE;
const isUrl = /^https?:\/\//i.test(SOURCE);

const raw = isUrl
	? await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) }).then((r) => {
			if (!r.ok) throw new Error(`fetch ${SOURCE} → ${r.status}`);
			return r.text();
		})
	: await readFile(SOURCE, 'utf8');

const puzzles = JSON.parse(raw);
if (!Array.isArray(puzzles) || puzzles.length === 0) {
	throw new Error(`expected a non-empty array, got: ${typeof puzzles}`);
}

// Shape check on the first entry — fail loud if the upstream contract drifts.
const sample = puzzles[0];
const required = ['question', 'answer', 'category', 'rating', 'source'];
const missing = required.filter((k) => !(k in sample));
if (missing.length) {
	throw new Error(
		`puzzle 0 missing ${missing.join(', ')} — upstream shape changed? Got keys: ${Object.keys(sample).join(', ')}`
	);
}

await mkdir(dirname(DEST), { recursive: true });
await writeFile(DEST, JSON.stringify(puzzles, null, '\t') + '\n');

const ratings = Object.fromEntries(
	['kids', 'family', 'mature', 'unrated'].map((r) => [r, puzzles.filter((p) => p.rating === r).length])
);
console.log(`✓ ${puzzles.length} puzzles synced`);
console.log(`  source: ${SOURCE}`);
console.log(`  dest:   ${DEST.replace(REPO_ROOT, '.')}`);
console.log(
	`  ratings: ${Object.entries(ratings).map(([k, v]) => `${k}=${v}`).join(' · ')}`
);
