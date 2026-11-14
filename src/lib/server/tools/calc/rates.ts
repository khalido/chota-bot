// Ported from jaldi: jaldi-agent/src/calc/rates.ts (2026-11-13). Keep the pair in step; see KO's note on sharing by copy.
/**
 * Daily currency rates for the calculator: Frankfurter v2, keyless, about 170
 * currencies against the US dollar, each on its own publication day. Cached in
 * memory for a day (`withTtl`); a failed refetch serves the last rates for up
 * to a week, then throws, and the calculator says rates are unavailable.
 */
import { withTtl } from '#lib/server/cache.ts';
import { fetchJson } from '#lib/server/tools/http.ts';

export interface Rates {
	/** The latest day any of them was published, `2026-11-04`. */
	readonly date: string;
	/** Units of each currency in one US dollar; USD itself is 1. */
	readonly perUSD: Readonly<Record<string, number>>;
	/** The day each code's rate was published, where it differs from `date`: v2's currencies come from different banks. */
	readonly dates: Readonly<Record<string, string>>;
}

const ENDPOINT = 'https://api.frankfurter.dev/v2/rates?base=usd';
const DAY_MS = 24 * 60 * 60_000;

/** The day `code`'s rate is from. */
export function rateDay(rates: Rates, code: string): string {
	return rates.dates[code] ?? rates.date;
}

/**
 * Frankfurter v2's reply, one `{ date, base, quote, rate }` per currency, as
 * rates: positive finite numbers keyed by three-letter codes, the dollar at 1.
 * Null when none is left.
 */
export function parseRates(json: unknown): Rates | null {
	if (!Array.isArray(json)) return null;
	const perUSD: Record<string, number> = { USD: 1 };
	const dates: Record<string, string> = {};
	let latest: string | undefined;
	for (const row of json as Record<string, unknown>[]) {
		if (row?.base !== 'USD' || typeof row.quote !== 'string' || typeof row.date !== 'string')
			continue;
		const { quote, rate, date } = row;
		if (
			!/^[A-Z]{3}$/.test(quote) ||
			typeof rate !== 'number' ||
			!Number.isFinite(rate) ||
			rate <= 0
		)
			continue;
		perUSD[quote] = rate;
		dates[quote] = date;
		if (latest === undefined || date > latest) latest = date;
	}
	if (latest === undefined || Object.keys(perUSD).length < 2) return null;
	for (const [code, day] of Object.entries(dates)) if (day === latest) delete dates[code];
	return { date: latest, perUSD, dates };
}

async function fetchRates(): Promise<Rates> {
	const rates = parseRates(
		await fetchJson<unknown>(ENDPOINT, { label: 'Frankfurter', timeoutMs: 8_000 })
	);
	if (rates === null) throw new Error('Frankfurter sent no rates');
	return rates;
}

export const getRates = withTtl('fx-rates', fetchRates, { ttl: DAY_MS, maxStale: 7 * DAY_MS });
