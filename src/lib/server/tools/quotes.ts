/**
 * Quotes tool — flat-pool picks across every `*-quotes.json` in the
 * sibling curios repo (`../curios/dist/`). The filename's prefix
 * becomes the `kind`:
 *
 *   curios/dist/tv-quotes.json     → kind 'tv'
 *   curios/dist/comic-quotes.json  → kind 'comic'
 *   curios/dist/book-quotes.json   → kind 'book'   (when curios adds it)
 *
 * Drop a new `<x>-quotes.json` into curios + push; no code change here.
 *
 * `clock-quotes.json` is also in that folder but loaded separately by
 * `./clock-quotes.ts` (HH:MM-keyed object, not a flat array). This
 * loader detects shape and skips non-array files, so the literary
 * clock data doesn't accidentally get adopted as a quote pool.
 *
 * `mature`-rated entries are dropped — this is a kid-facing surface.
 *
 * Two pick modes:
 *   - `getQuote({ date })` — stable per-Sydney-day pick. Same quote on
 *     every reprint of the same day's brief.
 *   - `getQuote()` — uniform random. The dashboard card rotates as the
 *     page refreshes.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sydneyYMD } from '$lib/time';

export interface Quote {
	/** Filename-derived kind: 'tv', 'comic', 'book', etc. */
	kind: string;
	quote: string;
	/** Speaker — null for a multi-speaker comic exchange (labels inline in `quote`). */
	speaker: string | null;
	/** The show / comic / book it's from, e.g. "Bluey", "Calvin and Hobbes". */
	title: string;
}

/** The fields we look for on a curios `*-quotes.json` entry. */
interface RawEntry {
	quote: string;
	speaker?: string | null;
	show?: string;
	comic?: string;
	book?: string;
	title?: string;
	rating?: string;
}

const DIR = resolve(process.cwd(), '../curios/dist');
const KIND_RE = /^(.+)-quotes\.json$/;

let cached: Quote[] | null = null;

/** Discover + load + normalise every `*-quotes.json` file. Cached. */
function load(): Quote[] {
	if (cached) return cached;
	let files: string[];
	try {
		files = readdirSync(DIR);
	} catch {
		cached = [];
		return cached;
	}
	const all: Quote[] = [];
	for (const file of files) {
		const m = KIND_RE.exec(file);
		if (!m) continue;
		const kind = m[1];
		let parsed: unknown;
		try {
			parsed = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
		} catch {
			continue;
		}
		// Shape-detect: this loader is for flat-array quote pools. The
		// literary clock's `clock-quotes.json` lives in the same folder
		// (curios/dist/) and matches the `*-quotes.json` pattern, but its
		// shape is an HH:MM-keyed object — skipped here, handled by
		// `./clock-quotes.ts` instead. Anything else non-array gets
		// skipped too.
		if (!Array.isArray(parsed)) continue;
		const raw = parsed as RawEntry[];
		for (const e of raw) {
			if (e.rating === 'mature') continue;
			all.push({
				kind,
				quote: e.quote,
				speaker: e.speaker ?? null,
				title: e.show ?? e.comic ?? e.book ?? e.title ?? ''
			});
		}
	}
	cached = all;
	return cached;
}

export interface GetQuoteOptions {
	/** Filter to one kind (filename-derived). Omit for any kind. */
	kind?: string;
	/** When set, returns a stable per-Sydney-day pick. Omit for uniform random. */
	date?: Date;
}

/**
 * Pick one quote — random by default, or stable per Sydney-local day when
 * `date` is passed. Returns null if the pool (after filters) is empty.
 */
export function getQuote(opts: GetQuoteOptions = {}): Quote | null {
	const pool = opts.kind ? load().filter((q) => q.kind === opts.kind) : load();
	if (pool.length === 0) return null;
	if (!opts.date) return pool[Math.floor(Math.random() * pool.length)];
	const ymd = sydneyYMD(opts.date);
	const seed = parseInt(ymd.slice(-2), 10) + parseInt(ymd.slice(5, 7), 10) * 31;
	return pool[seed % pool.length];
}

/** Diagnostic: pool size after the mature filter, optionally per kind. */
export function quoteCount(kind?: string): number {
	return kind ? load().filter((q) => q.kind === kind).length : load().length;
}

/** Diagnostic: distinct kinds discovered (one per file). */
export function quoteKinds(): string[] {
	return [...new Set(load().map((q) => q.kind))].sort();
}
