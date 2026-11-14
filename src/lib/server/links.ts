/**
 * Links in what chota sends: tracking taken out, the rest kept whole. Chat
 * apps need the full address to make a link tappable, so links are shortened by
 * cleaning, never by hiding part of them.
 *
 * Removed: analytics and click ids (utm_*, fbclid, gclid, …), referral tags,
 * share ids (`si` on Spotify and YouTube, `s`/`t` on X), and Amazon's `/ref=…`
 * path and tracking parameters. A parameter a page needs (a search `q`, a
 * YouTube `v` or `t`) stays. No maintained library does this: `tidy-url`, the
 * closest, last changed in June 2024.
 */

/** Parameters removed from every link. Matched whole, case-insensitive. */
const TRACKING = new Set([
	'fbclid',
	'gclid',
	'gclsrc',
	'dclid',
	'gbraid',
	'wbraid',
	'msclkid',
	'yclid',
	'twclid',
	'ttclid',
	'li_fat_id',
	'igshid',
	'igsh',
	'mc_cid',
	'mc_eid',
	'_hsenc',
	'_hsmi',
	'mkt_tok',
	'ref',
	'ref_src',
	'ref_url',
	'referrer',
	'cmpid',
	'oly_anon_id',
	'oly_enc_id',
	'vero_id',
	'spm',
	'trk',
	'trkcampaign',
	'sr_share',
	'share_source',
	'ved',
	'ei'
]);

/** Prefixes removed from every link: `utm_source`, `pd_rd_w`, … */
const TRACKING_PREFIXES = ['utm_', 'pd_rd_', 'pf_rd_', 'ga_', '__s'];

/** Parameters removed only on some sites, where they are share ids. */
const BY_SITE: [RegExp, string[]][] = [
	[/(^|\.)(spotify\.com|youtube\.com|youtu\.be)$/, ['si', 'feature', 'pp']],
	[/(^|\.)(x\.com|twitter\.com)$/, ['s', 't']],
	[/(^|\.)instagram\.com$/, ['img_index']],
	[
		/(^|\.)amazon\.[a-z.]+$/,
		[
			'tag',
			'linkcode',
			'linkid',
			'qid',
			'sr',
			'keywords',
			'crid',
			'sprefix',
			'content-id',
			'dib',
			'dib_tag'
		]
	],
	[/(^|\.)reddit\.com$/, ['share_id', 'utm_name', 'rdt']],
	[/(^|\.)linkedin\.com$/, ['trackingid', 'refid', 'lipi', 'midtoken', 'midsig', 'trk']]
];

/** Parameters kept on some sites although they're tracking elsewhere: on code
 *  hosts `ref` is a branch or tag. Amazon's `th` and `psc` pick a product's size
 *  or colour, so they were never on the list. */
const KEEP_BY_SITE: [RegExp, string[]][] = [
	[/(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/, ['ref']]
];

/** The link with its tracking taken out; anything that isn't an http(s) link comes back as it was. */
export function cleanUrl(raw: string): string {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return raw;
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') return raw;
	const host = url.hostname.toLowerCase();
	const siteOnly = BY_SITE.filter(([re]) => re.test(host)).flatMap(([, keys]) => keys);
	const keep = KEEP_BY_SITE.filter(([re]) => re.test(host)).flatMap(([, keys]) => keys);
	const drop = [...url.searchParams.keys()].filter((key) => {
		const k = key.toLowerCase();
		if (keep.includes(k)) return false;
		return (
			TRACKING.has(k) || siteOnly.includes(k) || TRACKING_PREFIXES.some((p) => k.startsWith(p))
		);
	});
	// Amazon: /dp/B0…/ref=sr_1_3 → /dp/B0…
	const path = /(^|\.)amazon\.[a-z.]+$/.test(host)
		? url.pathname.replace(/\/ref=[^/]*$/, '')
		: url.pathname;
	// Nothing to take out: the link exactly as it came, encoding and all.
	if (!drop.length && path === url.pathname) return raw;
	for (const key of drop) url.searchParams.delete(key);
	url.pathname = path;
	return url.toString();
}

/** Every link in a message cleaned: markdown links and bare addresses. */
export function cleanLinks(text: string): string {
	return text.replace(/https?:\/\/[^\s<>)\]"']+/g, (m) => {
		// Trailing punctuation belongs to the sentence, not the link.
		const tail = /[.,;:!?]+$/.exec(m)?.[0] ?? '';
		const link = tail ? m.slice(0, -tail.length) : m;
		return cleanUrl(link) + tail;
	});
}
