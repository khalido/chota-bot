import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sydneyHHMM } from '$lib/time';

const PATH = resolve(process.cwd(), 'data/quotes/literary.json');

export interface Quote {
	quote: string;
	/** Text before the time phrase. null if the phrase couldn't be located in the quote — render plain. */
	before: string | null;
	/** The literal time-substring inside the quote, e.g. "midnight", "half-past five". */
	time_phrase: string;
	/** Text after the time phrase. null if the phrase couldn't be located. */
	after: string | null;
	title: string;
	author: string;
	nsfw?: 'sfw' | 'unknown';
	lang?: string;
	source?: string;
}

type QuoteMap = Record<string, Quote[]>;

let cached: QuoteMap | null = null;

function load(): QuoteMap {
	if (cached) return cached;
	cached = JSON.parse(readFileSync(PATH, 'utf8')) as QuoteMap;
	return cached;
}

/**
 * Pick a quote for the given moment (Sydney local minute).
 * Random pick if multiple. Tries ±1 minute as fallback. Returns null if
 * nothing in a 3-minute window — caller renders a generic fallback.
 */
export function quoteForTime(now: Date = new Date()): Quote | null {
	const quotes = load();
	const hhmm = sydneyHHMM(now);
	const candidates = quotes[hhmm] ?? neighbour(quotes, hhmm);
	if (!candidates || candidates.length === 0) return null;
	return candidates[Math.floor(Math.random() * candidates.length)];
}

function neighbour(map: QuoteMap, hhmm: string): Quote[] | null {
	const [h, m] = hhmm.split(':').map(Number);
	for (const offset of [-1, 1]) {
		const total = h * 60 + m + offset;
		const wrapped = ((total % 1440) + 1440) % 1440;
		const key = `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
		const list = map[key];
		if (list && list.length) return list;
	}
	return null;
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}
