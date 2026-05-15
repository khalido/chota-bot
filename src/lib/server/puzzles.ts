/**
 * Daily puzzle pool. Question + answer per entry; we only print the question
 * but keep the answer around for the dashboard, an "answer" companion print,
 * or a reveal command later.
 *
 * Source: hand-curated classics for now (8 entries). To grow the pool,
 * append to puzzles.json -- shape is enforced by the Puzzle type below.
 */
import puzzles from './puzzles.json';
import { sydneyYMD } from '$lib/time';

export interface Puzzle {
	id: string;
	q: string;
	a: string;
	category: string;
	source: string;
}

const POOL: Puzzle[] = puzzles as Puzzle[];

/** Stable per-Sydney-day pick. Same puzzle for every reprint that day. */
export function pickPuzzle(now: Date = new Date()): Puzzle {
	const ymd = sydneyYMD(now);
	const seed = parseInt(ymd.slice(-2), 10) + parseInt(ymd.slice(5, 7), 10) * 31;
	return POOL[seed % POOL.length];
}

/** Diagnostic: full pool size (handy for /admin to confirm we loaded). */
export function puzzleCount(): number {
	return POOL.length;
}
