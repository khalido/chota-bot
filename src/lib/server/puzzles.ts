/**
 * Daily puzzle pool. Question + answer per entry; we only print the question
 * but keep the answer around for the dashboard, an "answer" companion print,
 * or a reveal command later.
 *
 * Source: the sibling curios repo at `../curios/dist/puzzles.json` —
 * cloned alongside chota-bot at `~/code/curios`, refreshed by deploy.sh
 * via `git pull` on every deploy. Path is relative to `process.cwd()`
 * which is the chota-bot repo root under both `vite dev` and the
 * systemd unit (chota.service sets WorkingDirectory).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sydneyYMD } from '$lib/time';

const PATH = resolve(process.cwd(), '../curios/dist/puzzles.json');

export interface Puzzle {
	question: string;
	answer: string;
	category: string;
	/** Audience rating from curios — ordered kids < family < mature, plus unrated. */
	rating: 'kids' | 'family' | 'mature' | 'unrated';
	source: string;
	/** Optional credit for puzzles drawn from a tradition (e.g. 'Tolkien-style'). */
	attribution?: string;
	lang?: string;
}

let cached: Puzzle[] | null = null;

function load(): Puzzle[] {
	if (cached) return cached;
	cached = JSON.parse(readFileSync(PATH, 'utf8')) as Puzzle[];
	return cached;
}

/** Stable per-Sydney-day pick. Same puzzle for every reprint that day. */
export function pickPuzzle(now: Date = new Date()): Puzzle {
	const pool = load();
	const ymd = sydneyYMD(now);
	const seed = parseInt(ymd.slice(-2), 10) + parseInt(ymd.slice(5, 7), 10) * 31;
	return pool[seed % pool.length];
}

/** Diagnostic: full pool size (handy for /admin to confirm we loaded). */
export function puzzleCount(): number {
	return load().length;
}
