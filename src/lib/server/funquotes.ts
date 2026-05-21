/**
 * Fun quotes — lines from TV shows and comic strips, for the brief's QUOTE
 * section and the dashboard quote card. Distinct from `quotes.ts`, which is the
 * time-keyed literary clock.
 *
 * Vendored from the curios repo into `data/quotes/tv-quotes.json` +
 * `comic-quotes.json` (flat arrays). `mature`-rated entries are dropped — this
 * is a kid-facing section.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sydneyYMD } from '$lib/time';

export interface FunQuote {
	kind: 'tv' | 'comic';
	quote: string;
	/** Speaker — null for a multi-speaker comic exchange (labels are inline in `quote`). */
	speaker: string | null;
	/** The show or comic it's from, e.g. "Bluey", "Calvin and Hobbes". */
	title: string;
}

/** The fields we read off a curios tv-/comic-quotes entry. */
interface RawEntry {
	quote: string;
	speaker: string | null;
	show?: string;
	comic?: string;
	rating?: string;
}

const DIR = resolve(process.cwd(), 'data/quotes');

let cached: FunQuote[] | null = null;

/** TV + comic quotes, mature dropped, both pools merged. Cached after first read. */
function load(): FunQuote[] {
	if (cached) return cached;
	cached = [...readPool('tv-quotes.json', 'tv'), ...readPool('comic-quotes.json', 'comic')];
	return cached;
}

function readPool(file: string, kind: 'tv' | 'comic'): FunQuote[] {
	let raw: RawEntry[];
	try {
		raw = JSON.parse(readFileSync(resolve(DIR, file), 'utf8')) as RawEntry[];
	} catch {
		return [];
	}
	return raw
		.filter((e) => e.rating !== 'mature')
		.map((e) => ({
			kind,
			quote: e.quote,
			speaker: e.speaker ?? null,
			title: e.show ?? e.comic ?? ''
		}));
}

/**
 * Stable per-Sydney-day pick — the same quote for every reprint that day.
 * For the printed brief. null if both pools are empty/missing.
 */
export function pickFunQuote(now: Date = new Date()): FunQuote | null {
	const pool = load();
	if (pool.length === 0) return null;
	const ymd = sydneyYMD(now);
	const seed = parseInt(ymd.slice(-2), 10) + parseInt(ymd.slice(5, 7), 10) * 31;
	return pool[seed % pool.length];
}

/** Random pick — for the dashboard card, which rotates as the page refreshes. */
export function randomFunQuote(): FunQuote | null {
	const pool = load();
	if (pool.length === 0) return null;
	return pool[Math.floor(Math.random() * pool.length)];
}

/** Diagnostic: pool size after the mature filter. */
export function funQuoteCount(): number {
	return load().length;
}
