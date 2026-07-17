/**
 * Volleyball NSW fixtures — each configured kid's next game + duty shift, for
 * the weekend family print.
 *
 * Source: volleyballnsw.com.au (RevolutioniseSPORT). Fully server-rendered —
 * plain fetch + cheerio, no JS needed. Per kid, `chota.config.ts` holds the
 * division draw URL (`/games/{comp}/{division}`) plus the team name; the tool
 *   1. fetches the draw page — a round index of `round/{n}` links, each with
 *      a "Sun 19 Jul" date — and picks the first round dated today-or-later
 *   2. fetches that round page and parses its game cards: date/time, venue,
 *      court, home/away teams, and the rostered DUTY team (kids must show up
 *      for duty games too)
 *   3. returns the games where the kid's team is playing and/or on duty
 *
 * Team names on the site are inconsistent ("SYDNEY ACERS VOLLEYBALL CLUB" on
 * one page, division-prefixed on another), so matching is a case-insensitive
 * substring of the configured name.
 *
 * Two pages per division per fetch, cached 6h — a very polite client. Pure
 * data; print formatting lives in print/sections.ts.
 */
import * as cheerio from 'cheerio';
import type { Kid } from '$lib/config';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';
import { sydneyDayOfWeek, sydneyYMD } from '$lib/time';

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 6 * 60 * 60_000;
/** A normal browser UA — the site serves plain curl fine, but be unremarkable. */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface VolleyballGame {
	/** Game date, `YYYY-MM-DD`. */
	date: string;
	/** Start time as printed, e.g. "8:00am". */
	time: string;
	venue: string;
	/** Compact court label, e.g. "Court D1". */
	court: string;
	home: string;
	away: string;
	/** The team rostered to duty this game. */
	duty: string;
	/** True once a score is up (result), false for an upcoming fixture. */
	played: boolean;
}

export interface VolleyballRound {
	/** Round label from the index — "Round 8", "Quarter Finals", … */
	round: string;
	/** Round date, `YYYY-MM-DD`. */
	date: string;
	games: VolleyballGame[];
}

/** One row of a division's pointscore ladder. */
export interface StandingRow {
	rank: number;
	team: string;
	played: number;
	points: number;
}

/** The opponent's ladder position, for "vs BLACKTOWN (#3 of 14, 18pts)". */
export interface OpponentRank {
	rank: number;
	/** Teams in the division — the "of 14" part. */
	of: number;
	points: number;
}

/** One kid's next fixture: the game they play and/or the game they duty. */
export interface KidFixture {
	kid: string;
	/** Division label from config, e.g. "YSVL - Under 15 Boys". */
	division: string;
	round: string;
	/** Round date, `YYYY-MM-DD`. */
	date: string;
	playing?: VolleyballGame;
	/** The other team in `playing` — resolved here (the tool knows which of
	 *  home/away is ours), so renderers don't re-match team names. */
	opponent?: string;
	/** The opponent's ladder rank + points — undefined when the pointscore
	 *  page is down or the opponent can't be matched to a ladder row. */
	opponentRank?: OpponentRank;
	duty?: VolleyballGame;
}

// ── fetch + cache ───────────────────────────────────────────────────────────

const cache = new Map<string, { at: number; round: VolleyballRound | null }>();

async function fetchHtml(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { 'user-agent': UA },
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`volleyball fetch ${res.status} for ${url}`);
	return res.text();
}

/**
 * "Sun 19 Jul" / "Sun 10 May 2026" → `YYYY-MM-DD`. The round index omits the
 * year; assume the current Sydney year, rolling forward if that lands the date
 * implausibly far in the past (a season never looks back more than ~4 months).
 */
export function parseFixtureDate(text: string, now: Date = new Date()): string | null {
	const m = /([A-Za-z]{3})\s+(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?/.exec(text);
	if (!m) return null;
	const day = Number(m[2]);
	const month = MONTHS.indexOf(m[3].slice(0, 3).toLowerCase());
	if (month < 0 || day < 1 || day > 31) return null;
	let year = m[4] ? Number(m[4]) : Number(sydneyYMD(now).slice(0, 4));
	if (!m[4]) {
		const candidate = Date.UTC(year, month, day);
		const today = Date.parse(`${sydneyYMD(now)}T00:00:00Z`);
		if (candidate < today - 120 * 86_400_000) year += 1;
	}
	return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "08:00" → "8am", "14:30" → "2:30pm" — the house compact style (matches
 *  `sydneyTimeCompact`: drop ":00" minutes), so volleyball rows read the same
 *  as the calendar rows they sit next to. Unparseable input passes through. */
function fmtTime(t: string): string {
	const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
	if (!m) return t.trim();
	const h = Number(m[1]);
	const ampm = h < 12 ? 'am' : 'pm';
	const mins = m[2] === '00' ? '' : `:${m[2]}`;
	return `${((h + 11) % 12) + 1}${mins}${ampm}`;
}

/** "Court D - 1" → "Court D1". */
function fmtCourt(c: string): string {
	return c
		.replace(/\s*-\s*/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The round index on a draw page: each row is an `<a href="…/round/{n}">` with
 * a `<b>` label and a sibling `<div>` holding the date. Exported for tests.
 */
export function parseRoundIndex(
	html: string,
	now: Date = new Date()
): { n: number; round: string; date: string }[] {
	const $ = cheerio.load(html);
	const rounds: { n: number; round: string; date: string }[] = [];
	$('a[href*="/round/"]').each((_, a) => {
		const href = $(a).attr('href') ?? '';
		const n = Number(/\/round\/(\d+)/.exec(href)?.[1]);
		if (!Number.isFinite(n)) return;
		const label = $(a).text().replace(/\s+/g, ' ').trim();
		const date = parseFixtureDate($(a).parent().text(), now);
		if (label && date) rounds.push({ n, round: label, date });
	});
	return rounds;
}

/**
 * The game cards on a round page. Each card carries date/time, venue + court,
 * the two team links, and the duty-team link (in DOM order: home, away, duty).
 * Exported for tests.
 */
export function parseRoundGames(html: string, now: Date = new Date()): VolleyballGame[] {
	const $ = cheerio.load(html);
	const games: VolleyballGame[] = [];
	$('.card.card-hover').each((_, card) => {
		const c = $(card);
		const teams = c
			.find('a[href*="/games/team/"]')
			.map((_, a) => $(a).text().replace(/\s+/g, ' ').trim())
			.get();
		if (teams.length < 3) return; // not a game card
		const dateCol = c.find('.col-lg-3').first().text();
		const date = parseFixtureDate(dateCol, now);
		if (!date) return;
		const time = /(\d{1,2}:\d{2})/.exec(dateCol)?.[1] ?? '';
		const venue = c.find('a[href*="/venues/"]').first().text().replace(/\s+/g, ' ').trim();
		const court = /Court\s+[^<\n]*/.exec(c.find('a[href*="/venues/"]').parent().text());
		// A played game shows a bold "3 - 0" between the team links; an upcoming
		// one shows a literal "vs".
		const played = /\d\s*-\s*\d/.test(c.find('b').text());
		games.push({
			date,
			time: fmtTime(time),
			venue,
			court: fmtCourt(court?.[0] ?? ''),
			home: teams[0],
			away: teams[1],
			duty: teams[2],
			played
		});
	});
	return games;
}

/**
 * The next round (today-or-later, Sydney) for a division draw URL, with its
 * games. null when the season's done or the pages didn't parse. Cached 6h.
 */
export async function getNextRound(
	drawUrl: string,
	now: Date = new Date()
): Promise<VolleyballRound | null> {
	const base = drawUrl.replace(/\/$/, '');
	const hit = cache.get(base);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.round;

	const today = sydneyYMD(now);
	const rounds = parseRoundIndex(await fetchHtml(base), now);
	const next = rounds.filter((r) => r.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0];
	let round: VolleyballRound | null = null;
	if (next) {
		const games = parseRoundGames(await fetchHtml(`${base}/round/${next.n}`), now);
		round = { round: next.round, date: next.date, games };
		log(
			'volleyball',
			`next round for ${base}: ${next.round} (${next.date}), ${games.length} games`
		);
	}
	cache.set(base, { at: Date.now(), round });
	return round;
}

/** Case-insensitive substring team match — site spellings vary per page. */
function isTeam(configured: string, pageName: string): boolean {
	return pageName.toLowerCase().includes(configured.toLowerCase());
}

/**
 * The pointscore ladder table: `rank. | team | played | points | …`. Only the
 * first four columns are kept — enough for "(#3 of 14, 18pts)". Exported for
 * tests.
 */
export function parseStandings(html: string): StandingRow[] {
	const $ = cheerio.load(html);
	const rows: StandingRow[] = [];
	$('table.table-hover tbody tr').each((_, tr) => {
		const cells = $(tr)
			.find('td')
			.map((_, td) => $(td).text().replace(/\s+/g, ' ').trim())
			.get();
		if (cells.length < 4) return;
		const rank = Number(cells[0].replace(/\.$/, ''));
		if (!Number.isFinite(rank) || !cells[1]) return;
		rows.push({
			rank,
			team: cells[1],
			played: Number(cells[2]) || 0,
			points: Number(cells[3]) || 0
		});
	});
	return rows;
}

const standingsCache = new Map<string, { at: number; rows: StandingRow[] }>();

/**
 * A division's ladder. The pointscore URL derives from the draw URL — same
 * `{comp}/{division}` path segments, `/games/` → `/pointscore/`. Cached 6h.
 */
export async function getStandings(drawUrl: string): Promise<StandingRow[]> {
	const url = drawUrl.replace(/\/$/, '').replace('/games/', '/pointscore/');
	const hit = standingsCache.get(url);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;
	const rows = parseStandings(await fetchHtml(url));
	standingsCache.set(url, { at: Date.now(), rows });
	return rows;
}

/** The opponent's ladder row, or undefined. Standings and fixture pages spell
 *  team names the same on this platform, but match both directions anyway. */
async function lookupOpponentRank(
	drawUrl: string,
	opponent: string
): Promise<OpponentRank | undefined> {
	try {
		const table = await getStandings(drawUrl);
		const row = table.find((r) => isTeam(r.team, opponent) || isTeam(opponent, r.team));
		return row ? { rank: row.rank, of: table.length, points: row.points } : undefined;
	} catch (err) {
		logErr('volleyball', `standings lookup failed for ${drawUrl}:`, err);
		return undefined;
	}
}

/**
 * Every configured kid's next-round fixture — the game they play and the game
 * they're rostered to duty, whenever that round is. Kids without a
 * `volleyball` config block are skipped; per-kid failures degrade to "no
 * entry" — a dead fixture page never sinks a brief or an agent answer.
 */
export async function getKidFixtures(now: Date = new Date()): Promise<KidFixture[]> {
	// Kids play in different divisions, so their lookups are independent —
	// run them concurrently (a dead division's 15s timeout shouldn't stall
	// the other kids' fixtures).
	const kids = getConfig().kids.filter((k) => k.volleyball);
	const results = await Promise.all(kids.map((kid) => kidFixture(kid, now)));
	return results.filter((f): f is KidFixture => f !== null);
}

async function kidFixture(kid: Kid, now: Date): Promise<KidFixture | null> {
	const vb = kid.volleyball;
	if (!vb) return null;
	try {
		const round = await getNextRound(vb.draw, now);
		if (!round) return null;
		const playing = round.games.find(
			(g) => !g.played && (isTeam(vb.team, g.home) || isTeam(vb.team, g.away))
		);
		// A team can be rostered to duty its own timeslot — that's one
		// commitment, not two. Deduped here so every consumer (print, agent)
		// inherits it rather than re-implementing the comparison.
		const duty = round.games.find((g) => !g.played && g !== playing && isTeam(vb.team, g.duty));
		if (!playing && !duty) return null;
		const opponent = playing
			? isTeam(vb.team, playing.home)
				? playing.away
				: playing.home
			: undefined;
		const opponentRank = opponent ? await lookupOpponentRank(vb.draw, opponent) : undefined;
		return {
			kid: kid.name,
			division: vb.division,
			round: round.round,
			date: round.date,
			playing,
			opponent,
			opponentRank,
			duty
		};
	} catch (err) {
		logErr('volleyball', `fixture lookup failed for ${kid.name}:`, err);
		return null;
	}
}

/**
 * Drop both caches and re-fetch every configured kid's fixture — the
 * `volleyball-refresh` job's entry point. The Friday prints then read a
 * minutes-old draw; the 6h TTL alone could serve the evening sheet a draw
 * cached that morning.
 */
export async function refreshFixtures(now: Date = new Date()): Promise<KidFixture[]> {
	cache.clear();
	standingsCache.clear();
	return getKidFixtures(now);
}

/**
 * `getKidFixtures` narrowed to the given dates (the upcoming weekend's
 * `YYYY-MM-DD`s) — the weekend print's view: fixtures next weekend or later
 * don't belong on this Friday's sheet.
 */
export async function getWeekendVolleyball(
	dates: string[],
	now: Date = new Date()
): Promise<KidFixture[]> {
	return (await getKidFixtures(now)).filter((f) => dates.includes(f.date));
}

/** The weekend (Sat, Sun) `YYYY-MM-DD`s at-or-after `ref`. */
export function weekendDates(ref: Date): string[] {
	for (let i = 0; i < 7; i++) {
		const d = new Date(ref.getTime() + i * 86_400_000);
		if (sydneyDayOfWeek(d) === 'Sat') {
			// Sunday by calendar arithmetic on the YMD, not instant+24h — on the
			// October spring-forward weekend (23h Sydney day) a late-night ref
			// would otherwise land instant math on Monday and silently drop
			// every real Sunday fixture.
			const sat = sydneyYMD(d);
			const [y, m, dd] = sat.split('-').map(Number);
			return [sat, new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10)];
		}
	}
	return [];
}
