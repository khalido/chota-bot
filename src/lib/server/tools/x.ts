/**
 * X (Twitter) through the official XDK (X API v2), on an app-only bearer
 * (`X_BEARER_TOKEN`). Modelled on kotools' `ko x` (`~/code/kotools/src/ko/x.py`).
 *
 * - `getPost` reads one post by link or id: its full text (long posts too), an
 *   X Article's text when there is one, and the links in it. Saving an X link
 *   uses this, because Exa returns nothing for x.com.
 * - `searchPosts` searches the last 7 days, or the full archive when `days` > 7.
 *   Scope it with X's operators: `from:<handle>`, `list:<id>`, `-is:retweet`.
 *
 * Pay per use (docs.x.com/x-api/getting-started/pricing, read 8 Nov 2026):
 * $0.005 per post returned, $0.010 per user, each charged once per UTC day.
 * Every call logs what it read and the cost at those rates. The X Console's
 * spending limit is the hard stop.
 */
import { Client, type Schemas } from '@xdevplatform/xdk';
import { X_BEARER_TOKEN } from '$app/env/private';
import { log } from '#lib/server/log.ts';

const SCOPE = 'x';
const POST_USD = 0.005;
const USER_USD = 0.01;
/** The recent-search index covers about the last 7 days; past that, full-archive search. */
const RECENT_DAYS = 7;

const QUERY = {
	// `author_id` is a real post field that the XDK 0.6.6 types leave out (jaldi casts it the same way).
	postFields: [
		'created_at',
		'author_id',
		'entities',
		'note_post',
		'article',
		'public_metrics'
	] as never,
	expansions: ['author_id' as const],
	userFields: ['username' as const, 'name' as const]
};

export interface XPost {
	id: string;
	/** The whole text, past 280 characters for a long post. */
	text: string;
	/** Username, no @; 'i' when unknown (x.com/i/status/<id> still opens). */
	author: string;
	authorName?: string;
	createdAt?: string;
	url: string;
	/** Links in the post, expanded, X's own (media, quotes) left out. */
	links: string[];
	/** An X Article attached to the post. */
	article?: { title?: string; text: string };
	likes: number;
	reposts: number;
}

let client: Client | undefined;

function x(): Client {
	if (!X_BEARER_TOKEN) throw new Error('Set X_BEARER_TOKEN in .env');
	client ??= new Client({ bearerToken: X_BEARER_TOKEN });
	return client;
}

const X_HOST = /^(?:www\.|mobile\.)?(?:x|twitter)\.com$/i;

/** The post id in an x.com or twitter.com status link, or a bare id. */
export function postId(ref: string): string | undefined {
	const s = ref.trim();
	if (/^\d{1,25}$/.test(s)) return s;
	const url = URL.parse(s);
	if (!url || !X_HOST.test(url.hostname)) return undefined;
	return url.pathname.match(/\/status(?:es)?\/(\d{1,25})/)?.[1];
}

/** The post id when `url` is a link to one X post (not a bare id). */
export const linkedPostId = (url: string) => (URL.canParse(url.trim()) ? postId(url) : undefined);

/** Hosts that are X itself or where its media lives: not a page to read. */
const X_OWN = /(^|\.)(x\.com|twitter\.com|t\.co|twimg\.com)$/i;

type Users = { id?: string; username?: string; name?: string }[] | undefined;

/** The SDK's post and its included users → our shape. Exported for tests. */
export function toPost(p: Schemas.Post, users: Users): XPost {
	const id = String(p.id);
	const user = users?.find((u) => u.id === p.authorId);
	const author = user?.username ?? 'i';
	const urls = p.notePost?.entities?.urls ?? p.entities?.urls ?? [];
	const links = [
		...new Set(
			urls
				.map((u) => u.expandedUrl ?? u.url)
				.filter((u): u is string => !!u && !X_OWN.test(URL.parse(u)?.hostname ?? ''))
		)
	];
	const art = p.article as { title?: unknown; plainText?: unknown } | undefined;
	const article =
		typeof art?.plainText === 'string' && art.plainText.trim()
			? { title: typeof art.title === 'string' ? art.title : undefined, text: art.plainText }
			: undefined;
	return {
		id,
		text: p.notePost?.text ?? p.text ?? '',
		author,
		authorName: user?.name,
		createdAt: p.createdAt,
		url: `https://x.com/${author}/status/${id}`,
		links,
		article,
		likes: p.publicMetrics?.likeCount ?? 0,
		reposts: p.publicMetrics?.repostCount ?? 0
	};
}

function spent(what: string, posts: number, users: number) {
	const usd = posts * POST_USD + users * USER_USD;
	log(SCOPE, `${what}: ${posts} posts, ${users} users, about $${usd.toFixed(3)}`);
}

/** One post by link or id. Throws when X has no such post (deleted, private). */
export async function getPost(ref: string): Promise<XPost> {
	const id = postId(ref);
	if (!id) throw new Error(`not an X post link: ${ref}`);
	const r = await x().posts.getById(id, QUERY);
	const users = r.includes?.users;
	spent(`post ${id}`, r.data ? 1 : 0, users?.length ?? 0);
	if (!r.data) {
		const why = r.errors?.[0]?.detail ?? 'X returned no post';
		throw new Error(`${why} (${id})`);
	}
	return toPost(r.data, users);
}

/**
 * Posts matching `query`, newest first, or most relevant with `top`. Over 7
 * days is a full-archive search, which X sorts newest first only, so `top` is
 * refused there. `n` is 10–100 per call, X's own floor and cap.
 */
export async function searchPosts(
	query: string,
	{ n = 10, days = RECENT_DAYS, top = false }: { n?: number; days?: number; top?: boolean } = {}
): Promise<XPost[]> {
	if (top && days > RECENT_DAYS) throw new Error('top works on the last 7 days only');
	const opts = {
		...QUERY,
		maxResults: Math.max(10, Math.min(n, 100)),
		startTime: new Date(Date.now() - days * 86_400_000).toISOString()
	};
	const r =
		days > RECENT_DAYS
			? await x().posts.searchAll(query, opts)
			: await x().posts.searchRecent(query, { ...opts, sortOrder: top ? 'relevancy' : 'recency' });
	const users = r.includes?.users;
	const posts = (r.data ?? []).slice(0, n).map((p) => toPost(p, users));
	spent(`search "${query}"`, r.data?.length ?? 0, users?.length ?? 0);
	return posts;
}
