/**
 * TMDB — movies and TV: find a title, then everything a family asks about it
 * in one request (details, AU age rating, where it streams, cast, trailer).
 *
 *   const info = await lookupTitle('Severance');      // best match, or null
 *   const hits = await searchTitles('dune', { kind: 'movie', year: 2021 });
 *   const { value } = await getTitle('tv', 95396);    // cached 12h
 *
 * Built on `tmdb-ts` (typed client, v4 Read Access Token as Bearer). Australia
 * is the default everywhere TMDB takes a region
 * (developer.themoviedb.org/docs/region-support): movie search shows AU release
 * dates, the cinema lists are AU's, watch providers (JustWatch data via TMDB)
 * are AU's. Ratings prefer the AU classification and fall back to the US one;
 * `mature` flags anything above PG-13 (AU MA15+/R18+, US R/NC-17/TV-MA).
 */
import { TMDB, type AppendToResponseMovieKey, type AppendToResponseTvKey } from 'tmdb-ts';
import { TMDB_READ_ACCESS_TOKEN } from '$env/static/private';
import { withTtl } from '$lib/server/cache';
import { log } from '$lib/server/log';

const REGION = 'AU';
const LANGUAGE = 'en-AU' as const;
const POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
const PROVIDER_LOGO_BASE = 'https://image.tmdb.org/t/p/original';
const TIMEOUT_MS = 10_000;
const CAST = 5;

/** Above PG-13. AU M is roughly PG-13 (15+ recommended, unrestricted). */
const MATURE = new Set(['MA15+', 'R18+', 'X18+', 'R', 'NC-17', 'TV-MA']);
/** TMDB writes AU labels inconsistently ("MA 15+", "MA15+"). */
const isMature = (label: string) => MATURE.has(label.replace(/\s+/g, '').toUpperCase());

export type TitleKind = 'movie' | 'tv';
export type OfferType = 'flatrate' | 'free' | 'ads' | 'rent' | 'buy';

/** A search hit — enough to pick one and say which it is. */
export interface TitleMatch {
	kind: TitleKind;
	id: number;
	title: string;
	year: number | null;
	overview: string;
	popularity: number;
	posterUrl: string | null;
}

export interface Rating {
	country: 'AU' | 'US';
	/** The classification as the country writes it: "MA15+", "PG-13", "TV-MA". */
	label: string;
	/** Above PG-13 — worth a mention to a family. */
	mature: boolean;
}

export interface WatchProvider {
	name: string;
	logoUrl: string | null;
	type: OfferType;
}

export interface TitleInfo extends TitleMatch {
	tagline: string;
	genres: string[];
	/** Movie runtime; for TV, TMDB's episode runtime or else the latest episode's. */
	runtimeMin: number | null;
	/** TMDB user score out of 10, and how many votes it rests on. */
	score: number;
	votes: number;
	rating: Rating | null;
	/** Top-billed cast. */
	cast: string[];
	/** Director(s) for a movie, creators for a show. */
	makers: string[];
	/** "Released", "Returning Series", "Ended", … */
	status: string;
	/** TV only. */
	seasons?: number;
	episodes?: number;
	/** TV only: date of the next episode, when one is scheduled. */
	nextEpisode?: string;
	/** YouTube link to the official trailer, when TMDB has one. */
	trailer: string | null;
	/** AU streaming/rent/buy, best offer per service (subscription first). */
	providers: WatchProvider[];
	/** TMDB's AU watch page — the fallback link when providers is empty. */
	watchLink: string | null;
	/** Movies only: when it reached AU cinemas and digital (streaming/rental). */
	releasedAU?: { cinema?: string; digital?: string };
	tmdbUrl: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Public
// ────────────────────────────────────────────────────────────────────────────

/** Movies and shows matching `query`, TMDB's relevance order. People dropped. */
export async function searchTitles(
	query: string,
	{ kind, year }: { kind?: TitleKind; year?: number } = {}
): Promise<TitleMatch[]> {
	const base = { query, include_adult: false, language: LANGUAGE };
	if (kind === 'movie') {
		const r = await client().search.movies({ ...base, region: REGION, primary_release_year: year });
		return r.results.map((m) => match('movie', m));
	}
	if (kind === 'tv') {
		const r = await client().search.tvShows({ ...base, first_air_date_year: year });
		return r.results.map((t) => match('tv', t));
	}
	const r = await client().search.multi(base);
	const hits = r.results.flatMap((x) =>
		x.media_type === 'movie' || x.media_type === 'tv' ? [match(x.media_type, x)] : []
	);
	return year ? hits.filter((h) => h.year === year) : hits;
}

/** Everything about one title, one TMDB request. Cached 12h; a failed refetch
 *  serves the last good copy for up to a week. */
export const getTitle = withTtl('tmdb', fetchTitle, {
	ttl: 12 * 60 * 60_000,
	maxStale: 7 * 24 * 60 * 60_000,
	max: 200
});

/** Search, pick the best match, return its details — or null when nothing matches. */
export async function lookupTitle(
	query: string,
	opts: { kind?: TitleKind; year?: number } = {}
): Promise<TitleInfo | null> {
	const best = pickMatch(query, await searchTitles(query, opts));
	if (!best) {
		log('tmdb', `no match for "${query}"`);
		return null;
	}
	return (await getTitle(best.kind, best.id)).value;
}

/** What's trending this day or week (movies, shows, or both). */
export async function trending(
	kind: TitleKind | 'all' = 'all',
	window: 'day' | 'week' = 'week'
): Promise<TitleMatch[]> {
	const r = await client().trending.trending(kind, window, { language: LANGUAGE });
	return r.results.flatMap((x) => {
		const k = kind === 'all' ? (x as { media_type?: string }).media_type : kind;
		return k === 'movie' || k === 'tv' ? [match(k, x as RawMatch)] : [];
	});
}

/** Movies in AU cinemas now. */
export async function inCinemas(): Promise<TitleMatch[]> {
	const r = await client().movies.nowPlaying({ region: REGION, language: LANGUAGE });
	return r.results.map((m) => match('movie', m));
}

/** Movies coming to AU cinemas soon. */
export async function comingSoon(): Promise<TitleMatch[]> {
	const r = await client().movies.upcoming({ region: REGION, language: LANGUAGE });
	return r.results.map((m) => match('movie', m));
}

/** "Something like X": TMDB's recommendations for a title. */
export async function recommendations(kind: TitleKind, id: number): Promise<TitleMatch[]> {
	const opts = { language: LANGUAGE };
	const r =
		kind === 'movie'
			? await client().movies.recommendations(id, opts)
			: await client().tvShows.recommendations(id, opts);
	return r.results.map((x) => match(kind, x as RawMatch));
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for tests)
// ────────────────────────────────────────────────────────────────────────────

/** An exact (case-insensitive) title among the top few wins; else TMDB's first. */
export function pickMatch(query: string, hits: TitleMatch[]): TitleMatch | null {
	const q = norm(query);
	return hits.slice(0, 5).find((h) => norm(h.title) === q) ?? hits[0] ?? null;
}

/** The AU classification, else the US one. Movies list several release types;
 *  the first with a certification counts. */
export function pickRating(byCountry: { country: string; labels: string[] }[]): Rating | null {
	for (const country of ['AU', 'US'] as const) {
		const label = byCountry.find((c) => c.country === country)?.labels.find((l) => l.trim());
		if (label) return { country, label: label.trim(), mature: isMature(label) };
	}
	return null;
}

/** Earliest AU cinema (limited or wide) and digital release dates, as YYYY-MM-DD. */
export function auReleases(dates: { type: number; release_date: string }[]): {
	cinema?: string;
	digital?: string;
} {
	const first = (types: number[]) =>
		dates
			.filter((d) => types.includes(d.type))
			.map((d) => d.release_date.slice(0, 10))
			.sort()[0];
	return { cinema: first([2, 3]), digital: first([4]) };
}

type RawOffer = { provider_name: string; logo_path?: string | null };
export type RawCountryProviders = { link?: string } & Partial<Record<OfferType, RawOffer[]>>;

/** One entry per service, its best offer: subscription, free, ads, rent, buy. */
export function pickProviders(country: RawCountryProviders | undefined): WatchProvider[] {
	const best = new Map<string, WatchProvider>();
	for (const type of ['flatrate', 'free', 'ads', 'rent', 'buy'] as const) {
		for (const p of country?.[type] ?? []) {
			if (best.has(p.provider_name)) continue;
			const logoUrl = p.logo_path ? `${PROVIDER_LOGO_BASE}${p.logo_path}` : null;
			best.set(p.provider_name, { name: p.provider_name, logoUrl, type });
		}
	}
	return [...best.values()];
}

// ────────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────────

let tmdb: TMDB | undefined;
function client(): TMDB {
	if (!TMDB_READ_ACCESS_TOKEN) {
		throw new Error('Set TMDB_READ_ACCESS_TOKEN in .env (TMDB Settings → API).');
	}
	// tmdb-ts has no timeout of its own, and on an HTTP error it rejects with
	// the parsed JSON body, not an Error. Both are fixed here, per request.
	tmdb ??= new TMDB(TMDB_READ_ACCESS_TOKEN, {
		fetch: async (url, init) => {
			const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!res.ok) throw new Error(`TMDB ${res.status}: ${(await res.text()).slice(0, 200)}`);
			return res;
		}
	});
	return tmdb;
}

const MOVIE_EXTRAS: AppendToResponseMovieKey[] = [
	'release_dates',
	'watch/providers',
	'credits',
	'videos'
];
const TV_EXTRAS: AppendToResponseTvKey[] = [
	'content_ratings',
	'watch/providers',
	'credits',
	'videos'
];

async function fetchTitle(kind: TitleKind, id: number): Promise<TitleInfo> {
	if (kind === 'movie') {
		const m = await client().movies.details(id, MOVIE_EXTRAS, LANGUAGE);
		const providers = auProviders(m['watch/providers'].results);
		return {
			...match('movie', m),
			tagline: m.tagline ?? '',
			genres: m.genres.map((g) => g.name),
			runtimeMin: m.runtime || null,
			score: round1(m.vote_average),
			votes: m.vote_count,
			rating: pickRating(
				m.release_dates.results.map((r) => ({
					country: r.iso_3166_1,
					labels: r.release_dates.map((d) => d.certification)
				}))
			),
			cast: m.credits.cast.slice(0, CAST).map((c) => c.name),
			makers: m.credits.crew.filter((c) => c.job === 'Director').map((c) => c.name),
			status: m.status,
			trailer: trailerUrl(m.videos.results),
			providers: pickProviders(providers),
			watchLink: providers?.link ?? null,
			releasedAU: auReleases(
				m.release_dates.results.find((r) => r.iso_3166_1 === REGION)?.release_dates ?? []
			),
			tmdbUrl: `https://www.themoviedb.org/movie/${id}`
		};
	}
	const t = await client().tvShows.details(id, TV_EXTRAS, LANGUAGE);
	const providers = auProviders(t['watch/providers'].results);
	return {
		...match('tv', t),
		tagline: t.tagline ?? '',
		genres: t.genres.map((g) => g.name),
		// episode_run_time is often empty now; the last episode's runtime isn't in
		// tmdb-ts's types but is in the response.
		runtimeMin:
			t.episode_run_time[0] ??
			(t.last_episode_to_air as { runtime?: number | null } | undefined)?.runtime ??
			null,
		score: round1(t.vote_average),
		votes: t.vote_count,
		rating: pickRating(
			t.content_ratings.results.map((r) => ({ country: r.iso_3166_1, labels: [r.rating] }))
		),
		cast: t.credits.cast.slice(0, CAST).map((c) => c.name),
		makers: t.created_by.map((c) => c.name),
		status: t.status,
		seasons: t.number_of_seasons,
		episodes: t.number_of_episodes,
		nextEpisode: t.next_episode_to_air?.air_date || undefined,
		trailer: trailerUrl(t.videos.results),
		providers: pickProviders(providers),
		watchLink: providers?.link ?? null,
		tmdbUrl: `https://www.themoviedb.org/tv/${id}`
	};
}

/** AU's offers from a watch-providers result. tmdb-ts types each country's
 *  offers differently (and not every country), so read it as a plain map. */
function auProviders(results: object): RawCountryProviders | undefined {
	return (results as Record<string, RawCountryProviders>)[REGION];
}

/** The fields search results and details share, across movie/tv naming. */
type RawMatch = {
	id: number;
	title?: string;
	name?: string;
	release_date?: string;
	first_air_date?: string;
	overview?: string;
	popularity?: number;
	poster_path?: string | null;
};

function match(kind: TitleKind, r: RawMatch): TitleMatch {
	const date = kind === 'movie' ? r.release_date : r.first_air_date;
	return {
		kind,
		id: r.id,
		title: (kind === 'movie' ? r.title : r.name) ?? '',
		year: date ? Number(date.slice(0, 4)) : null,
		overview: r.overview ?? '',
		popularity: r.popularity ?? 0,
		posterUrl: r.poster_path ? `${POSTER_BASE}${r.poster_path}` : null
	};
}

function trailerUrl(videos: { site: string; type: string; key: string; official?: boolean }[]) {
	const yt = videos.filter((v) => v.site === 'YouTube' && v.type === 'Trailer');
	const best = yt.find((v) => v.official) ?? yt[0];
	return best ? `https://www.youtube.com/watch?v=${best.key}` : null;
}

const norm = (s: string) =>
	s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
const round1 = (n: number) => Math.round(n * 10) / 10;
