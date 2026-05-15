/**
 * TMDB tool — search movies/TV, get watch providers in AU.
 *
 * Uses the v4 Read Access Token (Bearer auth). Set TMDB_READ_ACCESS_TOKEN in
 * .env. The legacy v3 API key isn't needed for these endpoints.
 *
 * Watch-providers data on TMDB is supplied by JustWatch via partnership, so
 * this gives us the same AU streaming info without hitting JW's
 * undocumented endpoints. TMDB is the preferred path going forward.
 */
import { TMDB_READ_ACCESS_TOKEN } from '$env/static/private';
import { log, logErr } from '$lib/server/log';

const BASE = 'https://api.themoviedb.org/3';
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/original';
const COUNTRY = 'AU';

export type OfferType = 'flatrate' | 'rent' | 'buy' | 'free' | 'ads';

export interface TmdbMovie {
	id: number;
	title: string;
	originalTitle: string;
	year: number | null;
	posterUrl: string | null;
	overview: string;
	voteAverage: number;
	popularity: number;
}

export interface TmdbShow {
	id: number;
	name: string;
	originalName: string;
	year: number | null;
	posterUrl: string | null;
	overview: string;
	voteAverage: number;
	popularity: number;
}

export interface WatchProvider {
	name: string;
	logoUrl: string | null;
	type: OfferType;
}

export interface WatchProviders {
	/** TMDB-hosted page that JW maintains. Good fallback to deep-link. */
	link: string;
	providers: WatchProvider[];
}

export interface EnrichedTitle {
	kind: 'movie' | 'tv';
	id: number;
	title: string;
	year: number | null;
	posterUrl: string | null;
	overview: string;
	voteAverage: number;
	providers: WatchProvider[];
	/** TMDB watch page link, fallback when no AU providers. */
	watchLink: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Public — search + enrichment
// ────────────────────────────────────────────────────────────────────────────

export async function searchMovie(query: string, year?: number): Promise<TmdbMovie[]> {
	const params = new URLSearchParams({ query, include_adult: 'false', language: 'en-AU' });
	if (year) params.set('primary_release_year', String(year));
	const data = await tmdbGet<TmdbSearchResponse<TmdbMovieRaw>>(`/search/movie?${params}`);
	return (data?.results ?? []).map(toMovie);
}

export async function searchTv(query: string, year?: number): Promise<TmdbShow[]> {
	const params = new URLSearchParams({ query, include_adult: 'false', language: 'en-AU' });
	if (year) params.set('first_air_date_year', String(year));
	const data = await tmdbGet<TmdbSearchResponse<TmdbShowRaw>>(`/search/tv?${params}`);
	return (data?.results ?? []).map(toShow);
}

export async function getMovieProviders(id: number): Promise<WatchProviders | null> {
	const data = await tmdbGet<TmdbProvidersResponse>(`/movie/${id}/watch/providers`);
	return providersFor(data);
}

export async function getTvProviders(id: number): Promise<WatchProviders | null> {
	const data = await tmdbGet<TmdbProvidersResponse>(`/tv/${id}/watch/providers`);
	return providersFor(data);
}

/**
 * One-shot enrichment for a list item: search by title, take TMDB's top
 * result (its relevance ranking handles "more recent" well in practice),
 * then fetch AU watch providers. Returns null if nothing matches.
 */
export async function enrichMovie(query: string, year?: number): Promise<EnrichedTitle | null> {
	const results = await searchMovie(query, year);
	const top = results[0];
	if (!top) {
		log('tmdb', `no movie results for "${query}"`);
		return null;
	}
	const providers = await getMovieProviders(top.id).catch(() => null);
	return {
		kind: 'movie',
		id: top.id,
		title: top.title,
		year: top.year,
		posterUrl: top.posterUrl,
		overview: top.overview,
		voteAverage: top.voteAverage,
		providers: providers?.providers ?? [],
		watchLink: providers?.link ?? null
	};
}

export async function enrichTv(query: string, year?: number): Promise<EnrichedTitle | null> {
	const results = await searchTv(query, year);
	const top = results[0];
	if (!top) {
		log('tmdb', `no tv results for "${query}"`);
		return null;
	}
	const providers = await getTvProviders(top.id).catch(() => null);
	return {
		kind: 'tv',
		id: top.id,
		title: top.name,
		year: top.year,
		posterUrl: top.posterUrl,
		overview: top.overview,
		voteAverage: top.voteAverage,
		providers: providers?.providers ?? [],
		watchLink: providers?.link ?? null
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────────

async function tmdbGet<T>(path: string): Promise<T | null> {
	if (!TMDB_READ_ACCESS_TOKEN) {
		throw new Error('Set TMDB_READ_ACCESS_TOKEN in .env (TMDB Settings → API).');
	}
	let res: Response;
	try {
		res = await fetch(`${BASE}${path}`, {
			headers: {
				accept: 'application/json',
				authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`
			},
			signal: AbortSignal.timeout(10_000)
		});
	} catch (err) {
		logErr('tmdb', `network error for ${path}:`, err);
		return null;
	}
	if (!res.ok) {
		logErr('tmdb', `HTTP ${res.status} for ${path}`);
		return null;
	}
	return (await res.json()) as T;
}

function providersFor(data: TmdbProvidersResponse | null): WatchProviders | null {
	const country = data?.results?.[COUNTRY];
	if (!country) return null;
	const providers: WatchProvider[] = [];
	for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy'] as OfferType[]) {
		for (const p of country[type] ?? []) {
			providers.push({
				name: p.provider_name,
				logoUrl: p.logo_path ? `${PROVIDER_LOGO_BASE}${p.logo_path}` : null,
				type
			});
		}
	}
	// Dedupe per-provider keeping highest priority offer (flatrate before rent etc.)
	const best = new Map<string, WatchProvider>();
	for (const p of providers) if (!best.has(p.name)) best.set(p.name, p);
	return { link: country.link, providers: [...best.values()] };
}

function toMovie(r: TmdbMovieRaw): TmdbMovie {
	return {
		id: r.id,
		title: r.title,
		originalTitle: r.original_title,
		year: r.release_date ? Number(r.release_date.slice(0, 4)) : null,
		posterUrl: r.poster_path ? `${POSTER_BASE}${r.poster_path}` : null,
		overview: r.overview ?? '',
		voteAverage: r.vote_average ?? 0,
		popularity: r.popularity ?? 0
	};
}

function toShow(r: TmdbShowRaw): TmdbShow {
	return {
		id: r.id,
		name: r.name,
		originalName: r.original_name,
		year: r.first_air_date ? Number(r.first_air_date.slice(0, 4)) : null,
		posterUrl: r.poster_path ? `${POSTER_BASE}${r.poster_path}` : null,
		overview: r.overview ?? '',
		voteAverage: r.vote_average ?? 0,
		popularity: r.popularity ?? 0
	};
}

// ────────────────────────────────────────────────────────────────────────────
// TMDB response types — only the fields we read.
// ────────────────────────────────────────────────────────────────────────────

interface TmdbSearchResponse<T> {
	results?: T[];
}

interface TmdbMovieRaw {
	id: number;
	title: string;
	original_title: string;
	release_date?: string;
	poster_path?: string | null;
	overview?: string;
	vote_average?: number;
	popularity?: number;
}

interface TmdbShowRaw {
	id: number;
	name: string;
	original_name: string;
	first_air_date?: string;
	poster_path?: string | null;
	overview?: string;
	vote_average?: number;
	popularity?: number;
}

interface TmdbProvidersResponse {
	results?: Record<
		string,
		{
			link: string;
			flatrate?: TmdbProviderRaw[];
			rent?: TmdbProviderRaw[];
			buy?: TmdbProviderRaw[];
			free?: TmdbProviderRaw[];
			ads?: TmdbProviderRaw[];
		}
	>;
}

interface TmdbProviderRaw {
	provider_id: number;
	provider_name: string;
	logo_path?: string | null;
}
