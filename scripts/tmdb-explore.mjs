#!/usr/bin/env node
/**
 * TMDB smoke test — verifies the keys work and shows what enrichment looks
 * like. Mirrors `tools/tmdb.ts` shape but standalone.
 *
 * Usage:
 *   node scripts/tmdb-explore.mjs                       # default search
 *   node scripts/tmdb-explore.mjs movie "Now You See Me 3"
 *   node scripts/tmdb-explore.mjs tv "The Bear"
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.themoviedb.org/3';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const COUNTRY = 'AU';

await loadEnv(resolve(REPO_ROOT, '.env'));
const TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
if (!TOKEN) {
	console.error('Set TMDB_READ_ACCESS_TOKEN in .env');
	process.exit(1);
}

const [, , kindArg, ...queryParts] = process.argv;
const kind = kindArg === 'tv' ? 'tv' : 'movie';
const query = queryParts.join(' ') || (kind === 'tv' ? 'The Bear' : 'Now You See Me 3');

console.log(`# Searching ${kind}: "${query}"\n`);

const search = await tmdb(`/search/${kind}?query=${encodeURIComponent(query)}&language=en-AU`);
const results = search?.results ?? [];
if (results.length === 0) {
	console.log('(no results)');
	process.exit(0);
}

console.log(`Top ${Math.min(3, results.length)} results:`);
for (const r of results.slice(0, 3)) {
	const title = kind === 'movie' ? r.title : r.name;
	const date = kind === 'movie' ? r.release_date : r.first_air_date;
	const year = date?.slice(0, 4) ?? '????';
	console.log(
		`  ${title} (${year})  vote=${r.vote_average?.toFixed(1)}  pop=${r.popularity?.toFixed(0)}  id=${r.id}`
	);
}

const top = results[0];
const topTitle = kind === 'movie' ? top.title : top.name;
console.log(`\n# Picked: ${topTitle}`);
if (top.poster_path) console.log(`Poster: ${POSTER_BASE}${top.poster_path}`);
if (top.overview)
	console.log(`\n${top.overview.slice(0, 200)}${top.overview.length > 200 ? '…' : ''}`);

console.log('\n# AU watch providers');
const provData = await tmdb(`/${kind}/${top.id}/watch/providers`);
const au = provData?.results?.[COUNTRY];
if (!au) {
	console.log('(none in AU)');
} else {
	console.log(`Link: ${au.link}`);
	for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy']) {
		const list = au[type];
		if (!list?.length) continue;
		console.log(`  ${type}: ${list.map((p) => p.provider_name).join(', ')}`);
	}
}

// ─────────────────────────────────────────────────────────────────

async function tmdb(path) {
	const res = await fetch(`${BASE}${path}`, {
		headers: { accept: 'application/json', authorization: `Bearer ${TOKEN}` }
	});
	if (!res.ok) {
		console.error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
		process.exit(1);
	}
	return res.json();
}

async function loadEnv(path) {
	let text;
	try {
		text = await readFile(path, 'utf8');
	} catch {
		return;
	}
	for (const line of text.split('\n')) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
		if (!m) continue;
		const [, k, raw] = m;
		const v = raw.replace(/^["']|["']$/g, '');
		if (!process.env[k]) process.env[k] = v;
	}
}
