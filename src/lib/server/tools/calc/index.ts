// Ported from jaldi: jaldi-agent/src/calc/calc.ts (2026-11-13). Keep the pair in step; see KO's note on sharing by copy.
/**
 * The calculator, for the agent: what is asked, evaluated by mathjs.
 * Arithmetic, `%`, powers, functions, hex and binary, units (`10 ft to m`,
 * `3 days in hours`) and currency (`100 usd in aud`, `£20 * 3`) from the
 * daily rates of about 170 currencies (`rates.ts`), each code a mathjs unit.
 * Home currency is AUD: an amount alone (`44 usd`) converts to it.
 *
 * Never throws: null is "not a sum". The guard is the feature: mathjs reads a
 * bare `m`, `h`, `s`, `e` or `pi` as a unit or a constant, so a digit is
 * required, and an answer that only says the input back (`42`, `5 m`) is
 * dropped. A complex, infinite or non-numeric answer is dropped too, never
 * shown as a clean number.
 */
import { all, create, type MathJsInstance, type MathNode, type Unit } from 'mathjs';
import { errorMessage, logger } from '#lib/server/log.ts';
import { getRates, rateDay, type Rates } from './rates.ts';

export { timeIn, type TimeAnswer } from './time.ts';

export interface Answer {
	/** The answer as shown: grouped digits, a unit after it. Empty when `note` says why there is none. */
	answer: string;
	/** The day of the rates money was converted at, or why there is no answer. */
	note?: string;
}

/** Past this a query is prose, not a sum. */
const MAX_CHARS = 200;
/** Significant digits shown; past them is noise from binary floating point (0.1 + 0.2). */
const PRECISION = 12;
/** Money converts to this when an amount stands alone. */
const HOME_CURRENCY = 'AUD';

let math: MathJsInstance | undefined;
let evaluate: MathJsInstance['evaluate'] | undefined;
/** mathjs's own `parse` and `createUnit`, kept before the instance's copies are switched off. */
let parseTree: MathJsInstance['parse'] | undefined;
let defineUnit: MathJsInstance['createUnit'] | undefined;
/** The codes mathjs knows as currencies, upper case. */
const currencies = new Set<string>();
/** The codes given a lower-case alias on the first load: a refresh re-aliases only these, never `cup`. */
const lowered = new Set<string>();
let rates: Rates | undefined;

/**
 * A private mathjs, built on the first sum. What reaches outside the
 * expression or changes the instance (`import`, `createUnit`, `evaluate`,
 * `parse`) is switched off for what the model types, per mathjs's security notes.
 */
function instance(): { math: MathJsInstance; evaluate: MathJsInstance['evaluate'] } {
	if (math === undefined || evaluate === undefined) {
		const made = create(all, { number: 'number' });
		const run = made.evaluate.bind(made);
		defineUnit = made.createUnit.bind(made);
		parseTree = made.parse.bind(made);
		const refuse = () => {
			throw new Error('not available in the calculator');
		};
		made.import(
			{
				// Reach outside the sum, or change the instance for every sum after it.
				import: refuse,
				createUnit: refuse,
				evaluate: refuse,
				parse: refuse,
				simplify: refuse,
				derivative: refuse,
				compile: refuse,
				resolve: refuse,
				reviver: refuse,
				config: refuse,
				// Build a matrix as big as asked.
				range: refuse,
				zeros: refuse,
				ones: refuse,
				identity: refuse,
				matrix: refuse,
				random: refuse,
				randomInt: refuse
			},
			{ override: true }
		);
		math = made;
		evaluate = run;
	}
	return { math, evaluate };
}

/**
 * Each currency as a mathjs unit defined against the US dollar, under its
 * code and its lower case (`GBP`, `gbp`), except where mathjs already reads
 * that name (`cup`, `mad`). A refresh redefines them.
 */
export function useRates(next: Rates): void {
	instance();
	if (defineUnit === undefined) return;
	for (const [code, perUSD] of Object.entries(next.perUSD)) {
		// The dollar is the base every other code is defined against: made once, never redefined.
		if (code === 'USD' && currencies.has(code)) continue;
		const definition = code === 'USD' ? {} : { definition: `${1 / perUSD} USD` };
		// Lower case only where mathjs has nothing by that name: `cup` stays the cup
		// (the Cuban peso is `CUP`), `mad` is a function (the dirham is `MAD`).
		const lower = code.toLowerCase();
		if (!currencies.has(code) && !taken(lower)) lowered.add(code);
		const aliases = lowered.has(code) ? [lower] : [];
		defineUnit(code, { ...definition, aliases }, { override: true });
		currencies.add(code);
	}
	rates = next;
}

/** Whether mathjs already reads `name`, as a unit or as a function or constant. */
function taken(name: string): boolean {
	const { math } = instance();
	if (name in math) return true;
	try {
		math.unit(name);
		return true;
	} catch {
		return false;
	}
}

/** Today's rates, applied to the instance. False when they cannot be had; non-money sums still work. */
async function ensureRates(): Promise<boolean> {
	try {
		const { value } = await getRates();
		if (value !== rates) useRates(value);
		return true;
	} catch (err) {
		logger('calc').warn(`currency rates unavailable: ${errorMessage(err)}`);
		return false;
	}
}

/** ISO codes (lower case) that a sum might name: decides whether to wait for rates. */
const CODES = new Set(Intl.supportedValuesOf('currency').map((code) => code.toLowerCase()));

/** Whether the text names money: a symbol, or a word that is a currency code. */
function mentionsMoney(text: string): boolean {
	return (
		/[$£€¥]/.test(text) || (text.toLowerCase().match(/[a-z]{3}/g) ?? []).some((w) => CODES.has(w))
	);
}

/** Money symbols before a number, as codes after it: `$100` is `100 USD`, `£20` is `20 GBP`. */
const SYMBOLS: Readonly<Record<string, string>> = { $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY' };

/** How a sum is written, into how mathjs reads one: `20% of 300`, `15% off 80`, `1,000`, `mph`, `30 min`, `°F`. */
export function rewrite(text: string): string {
	let out = text.trim();
	out = out.replace(
		/([$£€¥])\s*(\d[\d,]*(?:\.\d+)?)/g,
		(_, symbol: string, amount: string) => `${amount} ${SYMBOLS[symbol]}`
	);
	// Thousands separators: `1,000,000` (a comma between digits and three more), never
	// inside brackets, where a comma parts arguments: `max(1,234)` is 234.
	if (!/[([]/.test(out))
		while (/\d,\d{3}(?!\d)/.test(out)) out = out.replace(/(\d),(\d{3})(?!\d)/, '$1$2');
	// `15% off 80` is 80 less 15 %.
	out = out.replace(/^(.+?)\s*%\s*off\s+(.+)$/i, '($2) * (1 - ($1) / 100)');
	// `20% of 300`.
	out = out.replace(/(\d+(?:\.\d+)?)\s*%\s*of\s+/gi, '($1 / 100) * ');
	out = out.replace(/\bmph\b/gi, 'mi/h').replace(/\b(?:kph|kmh)\b/gi, 'km/h');
	// `min` is a function to mathjs; after a number it is minutes.
	out = out.replace(/(\d)\s*mins?\b/gi, '$1 minute');
	out = out.replace(/°\s*([fc])\b/gi, (_, scale: string) => ` deg${scale.toUpperCase()}`);
	// `100 f to c`, `20c in f`: one letter on each side of a conversion is a temperature.
	out = out.replace(
		/(\d)\s*([fc])\s+(to|in)\s+([fc])$/i,
		(_, digit: string, from: string, word: string, to: string) =>
			`${digit} deg${from.toUpperCase()} ${word} deg${to.toUpperCase()}`
	);
	return out;
}

const NO_RATES = "Currency rates are unavailable right now, so I can't convert money.";

/**
 * The answer for `text`, or null when it is not a sum. Money waits for the
 * day's rates; if they cannot be had, a sum that names money comes back with
 * an empty `answer` and a `note` saying so, everything else still works.
 */
export async function calculate(text: string): Promise<Answer | null> {
	const typed = text.trim();
	if (typed.length === 0 || typed.length > MAX_CHARS || !/\d/.test(typed)) return null;
	const money = mentionsMoney(typed);
	const haveRates = money ? await ensureRates() : true;
	const answer = amountAlone(typed) ?? evaluateSum(typed);
	if (answer !== null) return answer;
	return money && !haveRates ? { answer: '', note: NO_RATES } : null;
}

/** `text` as one sum, or null. */
function evaluateSum(text: string): Answer | null {
	const typed = text.trim();
	if (typed.length === 0 || typed.length > MAX_CHARS || !/\d/.test(typed) || /\n/.test(typed))
		return null;
	// A date (`2026-11-02`) is not a subtraction; a `:` is a time or a range, and a range can be as big as asked.
	if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(typed) || typed.includes(':')) return null;
	// A sum never assigns. `f(n)=f(n-1)+f(n-1); f(30)` would run for hours on the
	// one thread every chat, print and job shares (chota review, 13 Nov), and
	// the model writes the expression. Comparisons (`<=`, `==`) go with it.
	if (typed.includes('=') || typed.includes(';')) return null;
	let answer: Answer | null;
	try {
		const { math, evaluate } = instance();
		const rewritten = rewrite(typed);
		const result: unknown = evaluate(rewritten);
		// `php 8` and `100 usd` are not sums: money needs a conversion or arithmetic.
		if (isMoney(math, result) && !/\s(to|in)\s|[-+*/^%]/i.test(typed.replace(/^[$£€¥]/, '')))
			return null;
		const shown = describe(math, result);
		if (shown === null) return null;
		const note = isMoney(math, result) ? ratesNote(rewritten, result as Unit) : undefined;
		answer = { answer: shown.shown, ...(note ? { note } : {}) };
		// An answer that only says the input back is noise: `42`, `5 m`.
		const plain = (s: string) => s.replace(/[\s,]/g, '').toLowerCase();
		if (plain(shown.copy) === plain(typed) || plain(shown.shown) === plain(typed)) return null;
	} catch {
		return null;
	}
	return answer;
}

/** An amount and a currency, nothing else: `44 aud`, `44aud`, `$44`, `1,000 PKR`. */
const AMOUNT_ALONE = /^(?:[$£€¥]\s*\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s*[a-z]{3})$/i;

/** `44 usd` converted into the home currency; null when the text is not an amount alone, or is already in it. */
function amountAlone(typed: string): Answer | null {
	if (!AMOUNT_ALONE.test(typed)) return null;
	let source: string;
	try {
		const { math, evaluate } = instance();
		const amount: unknown = evaluate(rewrite(typed));
		if (!isMoney(math, amount)) return null;
		source = (amount as Unit).formatUnits().toUpperCase();
	} catch {
		return null;
	}
	if (source === HOME_CURRENCY || !currencies.has(HOME_CURRENCY)) return null;
	return evaluateSum(`${typed} to ${HOME_CURRENCY}`);
}

/** The shown and copied answer, before the note is added. */
interface Shown {
	shown: string;
	copy: string;
}

function describe(math: MathJsInstance, result: unknown): Shown | null {
	if (typeof result === 'number') {
		if (!Number.isFinite(result)) return null;
		return { shown: shownNumber(math, result), copy: math.format(result, { precision: 15 }) };
	}
	if (isMoney(math, result)) return money(math, result as Unit);
	if (math.isUnit(result)) {
		const unit = result as Unit;
		const value = unit.toNumeric(unit.formatUnits()) as unknown;
		if (typeof value !== 'number' || !Number.isFinite(value)) return null;
		const units = unit
			.formatUnits()
			.replace(/ \/ /g, '/')
			.replace(/\bdeg([CF])\b/g, '°$1');
		const number = shownNumber(math, value);
		return {
			shown: units.length > 0 ? `${number} ${units}` : number,
			copy: math.format(value, { precision: 15 })
		};
	}
	return null;
}

function isMoney(math: MathJsInstance, result: unknown): boolean {
	return math.isUnit(result) && currencies.has((result as Unit).formatUnits().toUpperCase());
}

/**
 * `74.57 GBP`, `8,848 JPY`: the currency's own decimals, the code after it
 * like any unit. An amount those decimals would round away (`1 idr in usd`)
 * keeps significant digits instead.
 */
function money(math: MathJsInstance, unit: Unit): Shown | null {
	const code = unit.formatUnits().toUpperCase();
	const value = unit.toNumber(unit.formatUnits());
	if (!Number.isFinite(value)) return null;
	const digits =
		new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
			.maximumFractionDigits ?? 2;
	const tiny = value !== 0 && Math.abs(value) < 10 ** -digits * 10;
	const format = (useGrouping: boolean) =>
		new Intl.NumberFormat('en', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
			useGrouping
		}).format(value);
	const number = tiny ? math.format(value, { precision: 4 }) : format(true);
	return {
		shown: `${number} ${code}`,
		copy: tiny ? math.format(value, { precision: 15 }) : format(false)
	};
}

/** `Rates of 3 Nov`: the oldest day among the rates a sum used (each currency it names, and the one it answers in). */
function ratesNote(rewritten: string, result: Unit): string | undefined {
	if (rates === undefined) return undefined;
	let named: string[] = [];
	try {
		named =
			(parseTree?.(rewritten) as MathNode | undefined)
				?.filter((node) => node.type === 'SymbolNode')
				.map((node) => (node as unknown as { name: string }).name.toUpperCase()) ?? [];
	} catch {
		// the answer stands without its note
	}
	const used = [...named, result.formatUnits().toUpperCase()].filter((code) =>
		currencies.has(code)
	);
	const oldest = used
		.map((code) => rateDay(rates!, code))
		.reduce((a, b) => (b < a ? b : a), rates.date);
	return `Rates of ${day(oldest)}`;
}

/** `2026-11-03` as `3 Nov`; another year's says it, `3 Nov 2025`. */
function day(date: string, now = new Date()): string {
	const when = new Date(`${date}T00:00:00Z`);
	const sameYear = when.getUTCFullYear() === now.getUTCFullYear();
	return when.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' }),
		timeZone: 'UTC'
	});
}

/** Twelve significant digits, grouped (`11,723.5`); an exponent stays as mathjs writes it. */
function shownNumber(math: MathJsInstance, value: number): string {
	const number = math.format(value, { precision: PRECISION });
	return /e/i.test(number) ? number : grouped(number);
}

function grouped(number: string): string {
	const [whole = '', fraction] = number.split('.');
	const sign = whole.startsWith('-') ? '-' : '';
	const digits = whole.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	return `${sign}${digits}${fraction === undefined ? '' : `.${fraction}`}`;
}
