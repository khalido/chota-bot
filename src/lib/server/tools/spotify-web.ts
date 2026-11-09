/**
 * Spotify's Web API, on the app's own credentials (client credentials: no user
 * sign-in, so dev mode's 5-user cap doesn't apply). It finds things to play and
 * hands back `spotify:` URIs; playing them is Soloist's job (`tools/spotify.ts`).
 * Keys: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET, from the app at
 * developer.spotify.com/dashboard.
 *
 * Spotify's guidelines, which everything added here must follow:
 * - Paths and fields come from the OpenAPI spec, never guessed, and never a
 *   deprecated endpoint: developer.spotify.com/reference/web-api/open-api-schema.yaml
 * - Client credentials for public data only. User data needs an Authorization
 *   Code sign-in, the fewest scopes, HTTPS redirects and token refresh.
 * - On a 429, respect Retry-After; never retry in a tight loop.
 * - Pass on Spotify's own error message.
 * - Terms (developer.spotify.com/terms): cache no content (the token is fine),
 *   attribute results to Spotify, and don't train models on the data.
 *
 * Our own small client, not an SDK: Spotify's SDK has had no release since
 * January 2024 and we only make a few GETs. Our types are loose because live data
 * leaves out fields the spec lists and sends null items. Reads are for the
 * Australian market, so they're playable here. Someone's own playlists and
 * library (`/me/...`) need their sign-in, so they aren't here.
 */
import { env } from '$env/dynamic/private';
import { fetchJson, responseError } from './http';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_URL = 'https://api.spotify.com/v1';
const MARKET = 'AU';
/** Spotify's cap on `limit` since February 2026. */
const MAX_LIMIT = 10;
const TIMEOUT_MS = 10_000;
/** The longest Retry-After we wait out on a 429; a longer one is an error. */
const MAX_RETRY_AFTER_S = 10;

let token: { value: string; until: number } | undefined;

async function accessToken(fresh: boolean): Promise<string> {
	if (!fresh && token && Date.now() < token.until) return token.value;
	const id = env.SPOTIFY_CLIENT_ID;
	const secret = env.SPOTIFY_CLIENT_SECRET;
	if (!id || !secret) throw new Error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
	const body = await fetchJson<{ access_token: string; expires_in: number }>(TOKEN_URL, {
		label: 'Spotify sign-in',
		method: 'POST',
		headers: {
			Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials',
		timeoutMs: TIMEOUT_MS
	});
	// Refresh a minute early, so a token never expires mid-request.
	token = { value: body.access_token, until: Date.now() + (body.expires_in - 60) * 1000 };
	return token.value;
}

/** GET a Web API path: one retry on an expired token, one wait for a short Retry-After. */
async function get<T>(path: string, params: Record<string, string>): Promise<T> {
	const url = `${API_URL}/${path}?${new URLSearchParams({ market: MARKET, ...params })}`;
	const send = async (fresh = false) =>
		fetch(url, {
			headers: { Authorization: `Bearer ${await accessToken(fresh)}` },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	let res = await send();
	if (res.status === 401) res = await send(true);
	if (res.status === 429) {
		const wait = Number(res.headers.get('Retry-After') ?? '1');
		if (!(wait <= MAX_RETRY_AFTER_S))
			throw new Error(`Spotify is rate-limiting; try again in ${wait} s`);
		await new Promise((r) => setTimeout(r, Math.max(1, wait) * 1000));
		res = await send();
	}
	if (!res.ok) throw new Error(`Spotify ${await responseError(res)}`);
	return res.json() as Promise<T>;
}

const limitParam = (n: number) => String(Math.min(Math.max(1, n), MAX_LIMIT));

/** The search types chota plays through Soloist. */
export type Kind = 'track' | 'album' | 'playlist' | 'artist' | 'show' | 'episode';

export interface Found {
	kind: Kind;
	uri: string;
	name: string;
	/** Artists for a track or album, the owner for a playlist. Search sends nothing for podcasts. */
	by?: string;
	album?: string;
}

type Item = {
	uri?: string;
	name?: string;
	artists?: { name?: string }[];
	album?: { name?: string };
	owner?: { display_name?: string };
} | null;

function byLine(kind: Kind, item: NonNullable<Item>): string | undefined {
	if (kind === 'playlist') return item.owner?.display_name;
	return (
		item.artists
			?.map((a) => a.name)
			.filter(Boolean)
			.join(', ') || undefined
	);
}

/** One search result → our shape, or undefined if it's unusable. Exported for tests. */
export function toFound(kind: Kind, item: Item): Found | undefined {
	if (!item?.uri || !item.name) return undefined;
	const by = byLine(kind, item);
	const album = kind === 'track' ? item.album?.name : undefined;
	return { kind, uri: item.uri, name: item.name, ...(by && { by }), ...(album && { album }) };
}

/** Search the catalogue; results in the order of `kinds`, best match first within each. */
export async function searchSpotify(
	query: string,
	{ kinds = ['track'] as Kind[], limit = 5 } = {}
): Promise<Found[]> {
	const q = query.trim();
	if (!q) return [];
	const body = await get<Record<string, { items?: Item[] } | undefined>>('search', {
		q,
		type: kinds.join(','),
		limit: limitParam(limit)
	});
	return kinds.flatMap((kind) =>
		(body[`${kind}s`]?.items ?? []).map((i) => toFound(kind, i)).filter((f): f is Found => !!f)
	);
}

export interface Episode {
	uri: string;
	name: string;
	released?: string;
}

/** A podcast's newest episodes, newest first. `showUri` is a `spotify:show:` URI. */
export async function recentEpisodes(showUri: string, count = 3): Promise<Episode[]> {
	const id = showUri.split(':').at(-1);
	const body = await get<{
		items?: ({ uri?: string; name?: string; release_date?: string } | null)[];
	}>(`shows/${id}/episodes`, { limit: limitParam(count) });
	return (body.items ?? []).flatMap((e) =>
		e?.uri && e.name ? [{ uri: e.uri, name: e.name, released: e.release_date }] : []
	);
}
