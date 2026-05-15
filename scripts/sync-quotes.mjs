#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const DEFAULT_URL = 'https://raw.githubusercontent.com/khalido/clockquotes/main/quotes.json';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = resolve(REPO_ROOT, 'data/quotes/literary.json');

// First arg overrides the source — pass a URL or a local file path.
// Default is the GitHub raw URL (the cloneable canonical source).
const SOURCE = process.argv[2] || DEFAULT_URL;

const HHMM = /^\d{2}:\d{2}$/;

const isUrl = /^https?:\/\//i.test(SOURCE);
const raw = isUrl
	? await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) }).then((r) => {
			if (!r.ok) throw new Error(`fetch ${SOURCE} → ${r.status}`);
			return r.text();
		})
	: await readFile(SOURCE, 'utf8');

const quotes = JSON.parse(raw);
const keys = Object.keys(quotes);
const bad = keys.filter((k) => !HHMM.test(k));
if (bad.length) throw new Error(`expected HH:MM keys, found: ${bad.slice(0, 3).join(', ')}…`);

const total = keys.reduce((n, k) => n + quotes[k].length, 0);
const sample = quotes[keys[0]][0];
if (!sample.quote || !sample.title || !sample.author) {
	throw new Error(`expected {quote,title,author}, got: ${JSON.stringify(sample).slice(0, 120)}`);
}

const fields = new Set(Object.keys(sample));
const hasNewSchema = fields.has('time_phrase');
const hasOldSchema = fields.has('annot');

await mkdir(dirname(DEST), { recursive: true });
await writeFile(DEST, JSON.stringify(quotes, null, '\t'));

console.log(`✓ ${keys.length} minutes, ${total} quotes`);
console.log(`  source: ${SOURCE}`);
console.log(`  dest:   ${DEST.replace(REPO_ROOT, '.')}`);
console.log(
	`  schema: ${hasNewSchema ? 'new (before/time_phrase/after)' : hasOldSchema ? 'OLD (annot/prefix/suffix) — push clockquotes upstream' : 'unknown'}`
);
