/**
 * Google Books volumes search — the primary book metadata source.
 *
 * Plain-text queries only: as of Oct 2026 the field operators (`intitle:`,
 * `inauthor:`, `isbn:`) return zero results, URL-encoded or not. No country
 * filter (a region filter only hides things). `fields` trims each volume to
 * what we read (~1.3 KB). Key: GOOGLE_BOOKS_API_KEY (the weather key works
 * once Books API is enabled on it); keyless calls hit a shared daily quota.
 */
import { env } from '$env/dynamic/private';
import type { BookHit } from './types';

const BASE = 'https://www.googleapis.com/books/v1/volumes';
const FIELDS =
	'items(id,volumeInfo(title,subtitle,authors,publishedDate,pageCount,categories,description,industryIdentifiers,imageLinks/thumbnail,infoLink))';

export async function searchGoogleBooks(query: string, max = 10): Promise<BookHit[]> {
	const params = new URLSearchParams({
		q: query,
		printType: 'books',
		langRestrict: 'en',
		orderBy: 'relevance',
		maxResults: String(max),
		fields: FIELDS
	});
	if (env.GOOGLE_BOOKS_API_KEY) params.set('key', env.GOOGLE_BOOKS_API_KEY);
	const res = await fetch(`${BASE}?${params}`, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) {
		const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
		throw new Error(`Google Books ${res.status}: ${err?.error?.message ?? res.statusText}`);
	}
	const data = (await res.json()) as { items?: Volume[] };
	return (data.items ?? []).map(toHit);
}

interface Volume {
	id: string;
	volumeInfo: {
		title: string;
		subtitle?: string;
		authors?: string[];
		publishedDate?: string;
		pageCount?: number;
		categories?: string[];
		description?: string;
		industryIdentifiers?: { type: string; identifier: string }[];
		imageLinks?: { thumbnail?: string };
		infoLink?: string;
	};
}

function toHit({ id, volumeInfo: v }: Volume): BookHit {
	return {
		source: 'google',
		title: v.title,
		subtitle: v.subtitle,
		authors: v.authors ?? [],
		year: v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null,
		pages: v.pageCount || null,
		categories: v.categories ?? [],
		description: stripTags(v.description ?? ''),
		isbn13: v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier ?? null,
		coverUrl: v.imageLinks?.thumbnail?.replace(/^http:/, 'https:') ?? null,
		link: v.infoLink ?? `https://books.google.com/books?id=${id}`
	};
}

/** Descriptions sometimes carry <p>/<b>/<br> markup. */
const stripTags = (s: string) =>
	s
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.trim();
