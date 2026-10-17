/**
 * Open Library search (openlibrary.org/developers/api) — the fallback when
 * Google Books finds nothing, and the source of reader ratings. Free, no key;
 * an identifying User-Agent gets 3 requests/s (1/s without). Community data:
 * good subjects and ratings, sometimes wrong first-publish years.
 */
import type { BookHit } from './types';

const BASE = 'https://openlibrary.org';
const UA = 'chota-bot/1.0 (family kiosk; github.com/khalido/chota-bot)';
const FIELDS =
	'key,title,subtitle,author_name,first_publish_year,number_of_pages_median,subject,ratings_average,ratings_count,isbn,cover_i';

export async function searchOpenLibrary(query: string, max = 5): Promise<BookHit[]> {
	const params = new URLSearchParams({ q: query, limit: String(max), fields: FIELDS });
	const res = await fetch(`${BASE}/search.json?${params}`, {
		headers: { 'user-agent': UA },
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`Open Library ${res.status}`);
	const data = (await res.json()) as { docs?: Doc[] };
	return (data.docs ?? []).map(toHit);
}

interface Doc {
	key: string;
	title: string;
	subtitle?: string;
	author_name?: string[];
	first_publish_year?: number;
	number_of_pages_median?: number;
	subject?: string[];
	ratings_average?: number;
	ratings_count?: number;
	isbn?: string[];
	cover_i?: number;
}

function toHit(d: Doc): BookHit {
	return {
		source: 'openlibrary',
		title: d.title,
		subtitle: d.subtitle,
		authors: d.author_name ?? [],
		year: d.first_publish_year ?? null,
		pages: d.number_of_pages_median ?? null,
		categories: (d.subject ?? []).slice(0, 6),
		description: '',
		isbn13: d.isbn?.find((i) => i.length === 13) ?? null,
		rating:
			d.ratings_average && d.ratings_count
				? { average: Math.round(d.ratings_average * 10) / 10, count: d.ratings_count }
				: undefined,
		coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
		link: `${BASE}${d.key}`
	};
}
