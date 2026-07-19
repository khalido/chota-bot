/**
 * Randwick City Council lifeguard reports — surf/beach conditions for the
 * family's beach (`chota.config.ts > home.beach`, e.g. Coogee), written by the
 * council lifeguards and refreshed each morning.
 *
 * Source: the council RSS feed, one `<item>` per beach (Clovelly, Maroubra,
 * Coogee). Each item's `<description>` is a CDATA HTML block of labelled
 * fields: Summary, Water Temp, Wave Height, Beach Status, Rips, Bluebottles,
 * Description. We parse the feed with cheerio (xml mode) and each description
 * with a second cheerio pass over its `<p><strong>Label:</strong> value</p>`.
 *
 * The kids play beach volleyball Fri arvo + Sun morning, so a one-line
 * conditions summary rides the Friday briefs + weekend sheet, and always the
 * agent's weather answer. `beachSummary()` is the sentence helper (sibling to
 * `weatherSummary()` in weather.ts); the parsed `BeachReport` is the pure data.
 */
import * as cheerio from 'cheerio';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';

const FEED_URL = 'https://www.randwick.nsw.gov.au/integration/feeds/lifeguard-reports';
const FETCH_TIMEOUT_MS = 10_000;
/** Lifeguards update through the morning; a short TTL keeps the Friday prints
 *  fresh without hammering the feed. */
const CACHE_TTL_MS = 30 * 60_000;
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

export interface BeachReport {
	/** Beach title from the feed, e.g. "Coogee Beach". */
	beach: string;
	/** When the lifeguards last posted (from `pubDate`), or null if unparsable. */
	updated: Date | null;
	/** Lifeguard's one-liner, e.g. "Rough conditions". */
	summary: string;
	/** Water temperature °C, or null if absent/unparsable. */
	waterTempC: number | null;
	/** Wave height as printed, e.g. "2m". */
	waveHeight: string;
	/** "Open" / "Closed" / … */
	status: string;
	/** Rip assessment, e.g. "Minimal", "Be cautious". */
	rips: string;
	/** Bluebottle presence, e.g. "None sighted". */
	bluebottles: string;
	/** Free-text detail from the lifeguard. */
	description: string;
}

// One report per beach name, cached with its fetch time.
const cache = new Map<string, { at: number; report: BeachReport | null }>();

async function fetchFeed(): Promise<string> {
	const res = await fetch(FEED_URL, {
		headers: { 'user-agent': UA },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`lifeguard feed ${res.status}`);
	return res.text();
}

/** "18 C" / "18°C" / "18" → 18; anything without a number → null. */
function parseWaterTemp(raw: string): number | null {
	const m = /(-?\d+(?:\.\d+)?)/.exec(raw);
	return m ? Number(m[1]) : null;
}

/**
 * Parse one beach's `<item>` out of the feed into a `BeachReport`. `name` is
 * matched case-insensitively as a substring of the item title ("Coogee" hits
 * "Coogee Beach"). Returns null when that beach isn't in the feed. Exported
 * for tests.
 */
export function parseBeachReport(xml: string, name: string): BeachReport | null {
	const $ = cheerio.load(xml, { xml: true });
	const item = $('item')
		.toArray()
		.find((el) => $(el).find('title').first().text().toLowerCase().includes(name.toLowerCase()));
	if (!item) return null;

	const $item = $(item);
	const title = $item.find('title').first().text().trim();
	const pub = $item.find('pubDate').first().text().trim();
	const updated = pub ? new Date(pub) : null;

	// Description is CDATA HTML — parse its <p><strong>Label:</strong> value</p>.
	const fields = new Map<string, string>();
	const $$ = cheerio.load($item.find('description').first().text());
	$$('p').each((_, p) => {
		const label = $$(p).find('strong').first().text().replace(/:\s*$/, '').trim();
		const strong = $$(p).find('strong').first().text();
		const value = $$(p).text().slice(strong.length).trim();
		if (label) fields.set(label.toLowerCase(), value);
	});
	const f = (label: string) => fields.get(label.toLowerCase()) ?? '';

	return {
		beach: title,
		updated: updated && !Number.isNaN(updated.getTime()) ? updated : null,
		summary: f('summary'),
		waterTempC: parseWaterTemp(f('water temp')),
		waveHeight: f('wave height'),
		status: f('beach status'),
		rips: f('rips'),
		bluebottles: f('bluebottles'),
		description: f('description')
	};
}

/**
 * The configured beach's latest lifeguard report, or null when no beach is
 * configured, the feed is down, or that beach isn't in it. Cached 30 min.
 */
export async function getBeachReport(now: Date = new Date()): Promise<BeachReport | null> {
	const name = getConfig().home?.beach?.name;
	if (!name) return null;

	const hit = cache.get(name);
	if (hit && now.getTime() - hit.at < CACHE_TTL_MS) return hit.report;

	try {
		const report = parseBeachReport(await fetchFeed(), name);
		cache.set(name, { at: now.getTime(), report });
		if (report) {
			log('beach', `${report.beach}: ${report.summary}, ${report.status}`);
		} else {
			log('beach', `"${name}" not found in lifeguard feed`);
		}
		return report;
	} catch (err) {
		logErr('beach', 'lifeguard feed fetch failed:', err);
		return null;
	}
}

/**
 * One-line conditions summary for the print + agent, e.g.
 * "Coogee: rough conditions, 18C water, 2m waves, open (rips: be cautious)."
 * Bluebottles are appended only when sighted — the usual "none sighted" is
 * noise. Temps use bare "C" (no degree glyph) to match `weatherSummary()` and
 * stay thermal-printer-safe. Sentence helper, sibling to `weatherSummary()`.
 */
export function beachSummary(r: BeachReport): string {
	const beach = r.beach.replace(/\s+beach$/i, '');
	const parts: string[] = [];
	if (r.summary) parts.push(r.summary.toLowerCase());
	if (r.waterTempC != null) parts.push(`${r.waterTempC}C water`);
	if (r.waveHeight) parts.push(`${r.waveHeight} waves`);
	if (r.status) parts.push(r.status.toLowerCase());
	// Feed shape drifted → an item with no parseable fields. Don't print "Coogee: ."
	if (parts.length === 0) return `${beach}: no report.`;
	let line = `${beach}: ${parts.join(', ')}`;
	const extras: string[] = [];
	if (r.rips && !/^(minimal|none|nil)$/i.test(r.rips)) extras.push(`rips: ${r.rips.toLowerCase()}`);
	if (r.bluebottles && !/^(none|nil)/i.test(r.bluebottles)) {
		extras.push(`bluebottles: ${r.bluebottles.toLowerCase()}`);
	}
	if (extras.length) line += ` (${extras.join('; ')})`;
	return `${line}.`;
}
