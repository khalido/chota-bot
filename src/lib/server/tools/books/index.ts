/**
 * Books — one lookup for "tell me about this book":
 *
 *   1. Metadata: Google Books and Open Library in parallel. Google's record
 *      wins; Open Library fills in when Google finds nothing, and adds its
 *      reader rating. Study guides and quiz books are skipped; duplicate
 *      editions collapse to the fullest one.
 *   2. Always the City of Sydney Library: is it held, is a copy on the shelf
 *      at the family's branches (`chota.config.ts > library.branches`), and
 *      the library's own age note.
 *   3. One Exa search: blurb, age guide, reception.
 *
 * Every source can fail on its own; the lookup returns what it got. Planned
 * source: NYT Books API (reviews, bestseller history, children's lists) —
 * see docs/tools.md.
 */
import { getConfig } from '$lib/server/config';
import { withTtl } from '$lib/server/cache';
import { log, logErr } from '$lib/server/log';
import { bookBlurb, type BookBlurb } from './exa';
import { searchGoogleBooks } from './google';
import { librarySearchUrl, searchLibrary, type LibraryCopy, type LibraryTitle } from './library';
import { searchOpenLibrary } from './openlibrary';
import type { BookHit } from './types';

export type { BookBlurb, BookHit, LibraryCopy, LibraryTitle };

const DAY = 24 * 60 * 60_000;
const google = withTtl('books:google', searchGoogleBooks, { ttl: 7 * DAY, max: 200 });
const openLibrary = withTtl('books:openlibrary', searchOpenLibrary, { ttl: 7 * DAY, max: 200 });
const library = withTtl('books:library', searchLibrary, { ttl: 10 * 60_000, max: 100 });
/** Exa costs per call — keep a book's blurb for a month. */
const blurb = withTtl('books:exa', bookBlurb, { ttl: 30 * DAY, max: 200 });

export interface BookInfo {
	book: BookHit;
	library: {
		/** The catalogue's records for this book (editions, formats), best first. */
		titles: LibraryTitle[];
		/** Copies on the shelf now at the family's branches. */
		nearby: LibraryCopy[];
		/** Across the matched print-book records (all records when none is a book). */
		onShelf: number;
		/** Every copy, on loan or not — known only when none is on the shelf. */
		total: number | null;
		/** People waiting on a reserve. */
		waiting: number;
		/** Branches with a copy on the shelf now. */
		branches: string[];
		/** The catalogue's results page — the link to send. */
		searchUrl: string;
	} | null;
	about: BookBlurb | null;
}

/** Look up one book by title (and author, if given in the query). */
export async function lookupBook(query: string): Promise<BookInfo | null> {
	const [g, ol] = await Promise.all([
		google(query).then((r) => r.value, failed('google', [] as BookHit[])),
		openLibrary(query).then((r) => r.value, failed('openlibrary', [] as BookHit[]))
	]);
	const fromGoogle = pickBook(query, g);
	const fromOl = pickBook(query, ol);
	const picked = fromGoogle ?? fromOl;
	if (!picked) {
		log('books', `no match for "${query}"`);
		return null;
	}
	const book =
		fromGoogle && fromOl && sameBook(fromGoogle, fromOl) ? merge(fromGoogle, fromOl) : picked;
	const author = book.authors[0];
	const [lib, about] = await Promise.all([
		getConfig().library ? libraryFor(book).catch(failed('library', null)) : null,
		blurb(book.title, author).then((r) => r.value, failed('exa', null))
	]);
	return { book, library: lib, about };
}

async function libraryFor(book: BookHit): Promise<BookInfo['library']> {
	// Keywords match whole words, so search the exact title; add the author's
	// surname to narrow a common title, and drop it if that finds nothing.
	const surname = book.authors[0]?.split(/\s+/).at(-1) ?? '';
	const keyword = surname ? `${book.title} ${surname}` : book.title;
	let titles = (await library(keyword)).value;
	let used = keyword;
	if (!titles.length && surname) {
		used = book.title;
		titles = (await library(book.title)).value;
	}
	const matches = matchLibrary(book, titles);
	const branches = getConfig().library?.branches ?? [];
	return {
		titles: matches,
		nearby: nearbyCopies(matches, branches),
		...holdings(matches),
		searchUrl: librarySearchUrl(used)
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ────────────────────────────────────────────────────────────────────────────

const JUNK =
	/\b(study guide|literature kit|summary of|summary &|quiz|workbook|sparknotes|cliffsnotes|analysis of|lesson plans?|teacher'?s guide|trivia)\b/i;

/**
 * The best hit for a query: drop guides and quiz books, collapse duplicate
 * editions to the fullest, then prefer a title (and author) the query names.
 */
export function pickBook(query: string, hits: BookHit[]): BookHit | null {
	const q = norm(query);
	const real = hits.filter((h) => !JUNK.test(`${h.title} ${h.subtitle ?? ''}`) && h.authors.length);
	const score = (h: BookHit) =>
		(q.includes(norm(h.title)) ? 2 : 0) +
		(h.authors.some((a) => q.includes(norm(a).split(' ').at(-1) ?? '~')) ? 1 : 0) +
		(h.pages && h.description ? 0.5 : 0);
	let best: BookHit | null = null;
	for (const h of real) {
		if (!best || score(h) > score(best)) best = h;
		else if (sameBook(h, best) && fullness(h) > fullness(best)) best = h;
	}
	return best;
}

/** The library's records for this book: same title start and author; the exact
 *  title first, then books before other formats, then copies on the shelf. */
export function matchLibrary(book: BookHit, titles: LibraryTitle[]): LibraryTitle[] {
	const t = norm(book.title);
	const surname = norm(book.authors[0]?.split(/\s+/).at(-1) ?? '');
	return titles
		.filter((x) => norm(x.title).startsWith(t) && (!surname || norm(x.author).includes(surname)))
		.sort(
			(a, b) =>
				Number(norm(b.title) === t) - Number(norm(a.title) === t) ||
				Number(b.format === 'BK') - Number(a.format === 'BK') ||
				b.available - a.available
		)
		.slice(0, 3);
}

/** One count across a book's library records: the print-book records when
 *  there are any, else every format. The catalogue gives a total only for a
 *  record with nothing on the shelf, so `total` is null unless all have one. */
export function holdings(titles: LibraryTitle[]) {
	const books = titles.filter((t) => t.format === 'BK');
	const basis = books.length ? books : titles;
	const totals = basis.map((t) => t.total);
	return {
		onShelf: basis.reduce((n, t) => n + t.available, 0),
		total: totals.every((n) => n !== null) ? totals.reduce((a, b) => a + b, 0) : null,
		waiting: basis.reduce((n, t) => n + t.reserves, 0),
		branches: [...new Set(basis.flatMap((t) => t.copies.map((c) => c.branch)))]
	};
}

/** Copies on the shelf at any of the family's branches ("Ultimo" matches "Ultimo Library"). */
export function nearbyCopies(titles: LibraryTitle[], branches: string[]): LibraryCopy[] {
	const want = branches.map(norm);
	return titles.flatMap((t) =>
		t.copies.filter((c) => want.some((b) => norm(c.branch).includes(b)))
	);
}

const sameBook = (a: BookHit, b: BookHit) =>
	norm(a.title) === norm(b.title) && norm(a.authors[0] ?? '') === norm(b.authors[0] ?? '');

const fullness = (h: BookHit) =>
	Number(!!h.pages) + Number(!!h.description) + Number(!!h.isbn13) + Number(!!h.coverUrl);

/** Google's facts plus Open Library's reader rating (and its subjects/ISBN when Google has none). */
function merge(g: BookHit, ol: BookHit): BookHit {
	return {
		...g,
		rating: ol.rating,
		categories: g.categories.length ? g.categories : ol.categories,
		isbn13: g.isbn13 ?? ol.isbn13
	};
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();

const failed =
	<T>(source: string, fallback: T) =>
	(err: unknown): T => {
		logErr('books', `${source} failed`, err);
		return fallback;
	};
