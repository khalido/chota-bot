/**
 * Literary clock quotes — pick a quote whose text mentions the current
 * time (e.g. "midnight", "half-past five"). HH:MM-keyed lookup, distinct
 * from the kind-filtered random pool in `./quotes.ts`.
 *
 * Data: `../curios/dist/clock-quotes.json` — curios is a sibling repo
 * cloned next to chota-bot (`~/code/curios`, `~/code/chota-bot`).
 * `deploy.sh` does a `git pull` in curios on every deploy, so the
 * dashboard is always reading current content.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sydneyHHMM } from '$lib/time';

const PATH = resolve(process.cwd(), '../curios/dist/clock-quotes.json');

export interface ClockQuote {
	quote: string;
	/** Text before the time phrase. null if the phrase couldn't be located in the quote — render plain. */
	before: string | null;
	/** The literal time-substring inside the quote, e.g. "midnight", "half-past five". */
	time_phrase: string;
	/** Text after the time phrase. null if the phrase couldn't be located. */
	after: string | null;
	title: string;
	author: string;
	/** Audience rating from curios — ordered kids < family < mature, plus unrated. */
	rating: 'kids' | 'family' | 'mature' | 'unrated';
	lang?: string;
	source?: string;
}

type ClockQuoteMap = Record<string, ClockQuote[]>;

/**
 * Eager-load at module init — `quoteForTime()` is on the dashboard's hot
 * path (called every minute on every page reload), so we pay the JSON
 * parse cost once at server start instead of stuttering the first
 * request. Tiny ~50ms hit at boot for a 3MB file; thereafter every
 * lookup is a single object-property read.
 *
 * If the file is missing, fall back to an empty map — the dashboard
 * still renders, just without a literary quote. preflight.ts logs the
 * missing DATABASE_URL etc., but not data files; the empty fallback
 * is the right "soft degrade" here.
 */
const QUOTES: ClockQuoteMap = loadOrEmpty();

function loadOrEmpty(): ClockQuoteMap {
	try {
		return JSON.parse(readFileSync(PATH, 'utf8')) as ClockQuoteMap;
	} catch {
		return {};
	}
}

/**
 * Pick a quote for the given moment (Sydney local minute).
 * Random pick if multiple. Tries ±1 minute as fallback. Returns null if
 * nothing in a 3-minute window — caller renders a generic fallback.
 *
 * Hot path: one Map.get, occasionally a neighbour() walk of ±1 minute.
 * The Math.random() within candidates makes the displayed quote vary
 * across page refreshes within the same minute — extra variety on a
 * dashboard that ticks every 60s.
 */
export function quoteForTime(now: Date = new Date()): ClockQuote | null {
	const hhmm = sydneyHHMM(now);
	const candidates = QUOTES[hhmm] ?? neighbour(hhmm);
	if (!candidates || candidates.length === 0) return null;
	return candidates[Math.floor(Math.random() * candidates.length)];
}

function neighbour(hhmm: string): ClockQuote[] | null {
	const [h, m] = hhmm.split(':').map(Number);
	for (const offset of [-1, 1]) {
		const total = h * 60 + m + offset;
		const wrapped = ((total % 1440) + 1440) % 1440;
		const key = `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
		const list = QUOTES[key];
		if (list && list.length) return list;
	}
	return null;
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}

/** Diagnostic: total minutes with at least one quote (for /admin). */
export function clockQuoteCoverage(): { minutes: number; total: number } {
	const minutes = Object.keys(QUOTES).length;
	const total = Object.values(QUOTES).reduce((n, arr) => n + arr.length, 0);
	return { minutes, total };
}
