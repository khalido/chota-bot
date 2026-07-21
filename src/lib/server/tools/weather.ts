/**
 * Google Weather API tool. Returns current conditions + hourly forecast,
 * plus two pure-function helpers that derive useful slices from the
 * hourly array (rain-soon and day-block grouping).
 *
 * Reference: https://developers.google.com/maps/documentation/weather
 * Endpoints used (parallel):
 *   GET /v1/currentConditions:lookup
 *   GET /v1/forecast/hours:lookup    (up to 48 hours = 2 days)
 */
import { GOOGLE_WEATHER_API_KEY } from '$env/static/private';
import { getConfig } from '$lib/server/config';
import { log } from '$lib/server/log';
import { sydneyDayOfWeek, sydneyHour, sydneyTimeCompact, sydneyYMD } from '$lib/time';
import type { WeatherThresholds } from '$lib/config';

const CURRENT_URL = 'https://weather.googleapis.com/v1/currentConditions:lookup';
const FORECAST_URL = 'https://weather.googleapis.com/v1/forecast/hours:lookup';

export interface ForecastHour {
	/** ISO-ish "YYYY-MM-DDTHH:00" (UTC instant from API). */
	at: Date;
	tempC: number;
	condition: string;
	rainPct: number;
	rainMm: number;
	windKmh: number;
}

export interface Weather {
	tempC: number;
	feelsLikeC: number;
	condition: string;
	humidityPct: number;
	windKmh: number;
	uvIndex: number;
	hourly: ForecastHour[];
}

export interface GetWeatherOptions {
	/** Defaults to chota.config.ts home.lat. */
	lat?: number;
	/** Defaults to chota.config.ts home.lon. */
	lon?: number;
	/** Forecast horizon (hours). Default 48 (max), gives 2 days. */
	hours?: number;
}

// Module-level cache, warmed every 30 min by the weather-refresh job (or by
// getWeather on cold start). `cachedAt` guards staleness: if the refresh job
// has been failing for hours, a read re-fetches instead of serving an ancient
// forecast — and if that fetch also fails it throws, so the caller degrades to
// "unavailable". A safety net only: the 30-min job keeps the cache far inside
// this window, so healthy operation never triggers an extra fetch.
const STALE_MS = 3 * 60 * 60_000; // 3h
let cache: Weather | null = null;
let cachedAt = 0;

/** Read latest weather. Returns the cache while fresh; re-fetches when cold or stale. */
export async function getWeather(opts: GetWeatherOptions = {}): Promise<Weather> {
	if (cache && Date.now() - cachedAt < STALE_MS && !hasOverrides(opts)) return cache;
	return refreshWeather(opts);
}

function hasOverrides(opts: GetWeatherOptions): boolean {
	return opts.lat != null || opts.lon != null || (opts.hours != null && opts.hours !== 48);
}

/** Always fetch + replace cache. Called by the weather-refresh job + as the
 *  cold-start path of getWeather. */
export async function refreshWeather({
	lat,
	lon,
	hours = 48
}: GetWeatherOptions = {}): Promise<Weather> {
	if (!GOOGLE_WEATHER_API_KEY) {
		throw new Error('Set GOOGLE_WEATHER_API_KEY in .env');
	}

	const home = getConfig().home;
	const latitude = lat ?? home?.lat;
	const longitude = lon ?? home?.lon;
	if (latitude == null || longitude == null) {
		throw new Error(
			'No coordinates: set home.lat + home.lon in chota.config.ts or pass {lat, lon}'
		);
	}

	const params = new URLSearchParams({
		key: GOOGLE_WEATHER_API_KEY,
		'location.latitude': String(latitude),
		'location.longitude': String(longitude)
	});
	const forecastParams = new URLSearchParams(params);
	forecastParams.set('hours', String(Math.min(hours, 48)));

	const [currentRes, forecastRes] = await Promise.all([
		fetch(`${CURRENT_URL}?${params}`, { signal: AbortSignal.timeout(10_000) }),
		fetch(`${FORECAST_URL}?${forecastParams}`, { signal: AbortSignal.timeout(10_000) })
	]);

	if (!currentRes.ok) {
		throw new Error(
			`Google Weather currentConditions ${currentRes.status}: ${await currentRes.text().catch(() => '')}`
		);
	}
	if (!forecastRes.ok) {
		throw new Error(
			`Google Weather forecast/hours ${forecastRes.status}: ${await forecastRes.text().catch(() => '')}`
		);
	}

	const current = (await currentRes.json()) as GoogleCurrent;
	const forecast = (await forecastRes.json()) as GoogleForecast;

	const hourly: ForecastHour[] = (forecast.forecastHours ?? []).map(toForecastHour);

	log(
		'weather',
		`current ${current.temperature?.degrees ?? '?'}C ${current.weatherCondition?.description?.text ?? '?'}; ${hourly.length} hourly`
	);

	const data: Weather = {
		tempC: current.temperature?.degrees ?? 0,
		feelsLikeC: current.feelsLikeTemperature?.degrees ?? 0,
		condition: current.weatherCondition?.description?.text ?? 'Unknown',
		humidityPct: current.relativeHumidity ?? 0,
		windKmh: current.wind?.speed?.value ?? 0,
		uvIndex: current.uvIndex ?? 0,
		hourly
	};
	if (!hasOverrides({ lat, lon, hours })) {
		cache = data;
		cachedAt = Date.now();
	}
	return data;
}

// ────────────────────────────────────────────────────────────────────────────
// Pure helpers — derive useful slices from the hourly array.
// ────────────────────────────────────────────────────────────────────────────

export interface RainSoon {
	startsAt: Date;
	startsInMins: number;
	peakAt: Date;
	peakPct: number;
}

/**
 * Find the first hour in the (near) future where precipitation probability
 * crosses `threshold`, plus the peak within `windowHours` after that.
 * Returns null if no hour exceeds the threshold.
 */
export function findRainSoon(
	hourly: ForecastHour[],
	now: Date = new Date(),
	threshold = 50,
	windowHours = 12
): RainSoon | null {
	const future = hourly.filter((h) => h.at.getTime() >= now.getTime());
	const onset = future.find((h) => h.rainPct >= threshold);
	if (!onset) return null;

	const windowEnd = onset.at.getTime() + windowHours * 60 * 60 * 1000;
	const window = future.filter((h) => h.at.getTime() <= windowEnd);
	const peak = window.reduce((m, h) => (h.rainPct > m.rainPct ? h : m), onset);

	return {
		startsAt: onset.at,
		startsInMins: Math.round((onset.at.getTime() - now.getTime()) / 60_000),
		peakAt: peak.at,
		peakPct: peak.rainPct
	};
}

export type BlockName = 'Morning' | 'Noon' | 'Evening' | 'Night';
export interface DayBlock {
	/** "Sat 9 May" Sydney */
	dayLabel: string;
	weekday: string; // 'Sat' etc
	dateKey: string; // '2026-05-09' for grouping
	block: BlockName;
	startHour: number; // 6 / 12 / 18 / 0
	tempC: number; // mean
	tempMaxC: number;
	tempMinC: number;
	condition: string; // dominant
	rainPct: number; // max
	rainMm: number; // sum
	windKmh: number; // mean
	hours: ForecastHour[];
}

/** Block windows in Sydney local time. */
const BLOCKS: { name: BlockName; startHour: number; endHour: number }[] = [
	{ name: 'Night', startHour: 0, endHour: 6 },
	{ name: 'Morning', startHour: 6, endHour: 12 },
	{ name: 'Noon', startHour: 12, endHour: 18 },
	{ name: 'Evening', startHour: 18, endHour: 24 }
];

/**
 * Group hourly forecast into per-day, per-time-of-day blocks (Sydney local).
 * Returns blocks in chronological order. Empty blocks (e.g. early morning
 * for 'today' if it's already evening) are dropped.
 */
export function groupByDayBlocks(hourly: ForecastHour[]): DayBlock[] {
	const buckets = new Map<string, ForecastHour[]>();
	for (const h of hourly) {
		const date = sydneyDateKey(h.at);
		const hour = sydneyHourFor(h.at);
		const block = BLOCKS.find((b) => hour >= b.startHour && hour < b.endHour)!;
		const key = `${date}|${block.name}`;
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(h);
	}

	const blocks: DayBlock[] = [];
	for (const [key, hours] of buckets) {
		const [dateKey, blockName] = key.split('|') as [string, BlockName];
		const block = BLOCKS.find((b) => b.name === blockName)!;
		const temps = hours.map((h) => h.tempC);
		const winds = hours.map((h) => h.windKmh);

		blocks.push({
			dateKey,
			weekday: sydneyDayOfWeek(hours[0].at),
			dayLabel: sydneyShortLabel(hours[0].at),
			block: blockName,
			startHour: block.startHour,
			tempC: avg(temps),
			tempMaxC: Math.max(...temps),
			tempMinC: Math.min(...temps),
			condition: dominant(hours.map((h) => h.condition)),
			rainPct: Math.max(...hours.map((h) => h.rainPct)),
			rainMm: hours.reduce((s, h) => s + h.rainMm, 0),
			windKmh: avg(winds),
			hours
		});
	}

	return blocks.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startHour - b.startHour);
}

// ────────────────────────────────────────────────────────────────────────────

function toForecastHour(h: GoogleForecastHour): ForecastHour {
	const t = h.interval?.startTime ?? h.displayDateTime?.utcOffset ?? null;
	const at = t ? new Date(t) : sydneyAtFromDisplayDate(h.displayDateTime);
	return {
		at,
		tempC: h.temperature?.degrees ?? 0,
		condition: h.weatherCondition?.description?.text ?? 'Unknown',
		rainPct: h.precipitation?.probability?.percent ?? 0,
		rainMm: h.precipitation?.qpf?.quantity ?? 0,
		windKmh: h.wind?.speed?.value ?? 0
	};
}

function sydneyAtFromDisplayDate(d?: GoogleDisplayDateTime): Date {
	if (!d) return new Date();
	const ymd = `${d.year ?? 1970}-${pad(d.month ?? 1)}-${pad(d.day ?? 1)}`;
	const hms = `${pad(d.hours ?? 0)}:${pad(d.minutes ?? 0)}:00`;
	return new Date(`${ymd}T${hms}+10:00`); // best-effort; overwritten when interval.startTime present
}

function sydneyDateKey(d: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Australia/Sydney',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

function sydneyHourFor(d: Date): number {
	return parseInt(
		new Intl.DateTimeFormat('en-US', {
			timeZone: 'Australia/Sydney',
			hour: 'numeric',
			hour12: false
		}).format(d),
		10
	);
}

function sydneyShortLabel(d: Date): string {
	const weekday = new Intl.DateTimeFormat('en-AU', {
		timeZone: 'Australia/Sydney',
		weekday: 'short'
	}).format(d);
	const day = parseInt(
		new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric' }).format(d),
		10
	);
	const month = new Intl.DateTimeFormat('en-AU', {
		timeZone: 'Australia/Sydney',
		month: 'short'
	}).format(d);
	return `${weekday} ${day} ${month}`;
}

function avg(ns: number[]): number {
	return ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length;
}

function dominant(strs: string[]): string {
	const counts = new Map<string, number>();
	for (const s of strs) counts.set(s, (counts.get(s) ?? 0) + 1);
	let best = strs[0] ?? 'Unknown';
	let max = 0;
	for (const [k, v] of counts) {
		if (v > max) {
			max = v;
			best = k;
		}
	}
	return best;
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}

// ────────────────────────────────────────────────────────────────────────────
// Google Weather API response types (only the fields we read).
// ────────────────────────────────────────────────────────────────────────────

interface GoogleCurrent {
	temperature?: { degrees?: number };
	feelsLikeTemperature?: { degrees?: number };
	weatherCondition?: { description?: { text?: string } };
	relativeHumidity?: number;
	wind?: { speed?: { value?: number } };
	uvIndex?: number;
}

interface GoogleForecast {
	forecastHours?: GoogleForecastHour[];
}

interface GoogleForecastHour {
	interval?: { startTime?: string; endTime?: string };
	displayDateTime?: GoogleDisplayDateTime;
	temperature?: { degrees?: number };
	weatherCondition?: { description?: { text?: string } };
	precipitation?: {
		probability?: { percent?: number };
		qpf?: { quantity?: number };
	};
	wind?: { speed?: { value?: number } };
}

interface GoogleDisplayDateTime {
	year?: number;
	month?: number;
	day?: number;
	hours?: number;
	minutes?: number;
	utcOffset?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Headline rules engine — see docs/weather.md for design.
// ────────────────────────────────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: WeatherThresholds = {
	coldC: 12,
	hotC: 28,
	windyKmh: 30,
	uvHigh: 8,
	rainPctSoon: 50,
	rainSoonMins: 120
};

/**
 * Returns the one most-actionable sentence for the kiosk. Same rule order
 * as docs/weather.md §"Headline rules engine". First match wins.
 */
export function weatherSummary(
	weather: Weather,
	thresholds: Partial<WeatherThresholds> = {},
	now: Date = new Date()
): string {
	const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

	// 1. Rain soon
	const rain = findRainSoon(weather.hourly, now, t.rainPctSoon);
	if (rain && rain.startsInMins <= t.rainSoonMins) {
		if (rain.startsInMins < 60) {
			return `Rain in ~${rain.startsInMins} min (peaks ${rain.peakPct}%).`;
		}
		return `Rain by ${sydneyTimeCompact(rain.startsAt)} (${rain.peakPct}%).`;
	}

	// 2. UV high
	if (weather.uvIndex >= t.uvHigh) {
		return `UV ${Math.round(weather.uvIndex)} -- sunscreen + hats.`;
	}

	// 3-4. Cold / Hot today
	const range = todayRange(weather.hourly, now);
	if (range && range.maxC < t.coldC) {
		return `Cold today, peak ${Math.round(range.maxC)}C -- jackets on.`;
	}
	if (range && range.maxC > t.hotC) {
		return `Hot day, peaks ${Math.round(range.maxC)}C -- water + hats.`;
	}

	// 5. Windy now
	if (weather.windKmh > t.windyKmh) {
		return `Windy, ${Math.round(weather.windKmh)} km/h.`;
	}

	// 6. Default — condition + range
	if (range) {
		return `${weather.condition}, ${Math.round(range.minC)}-${Math.round(range.maxC)}C today.`;
	}
	return `${weather.condition}, ${Math.round(weather.tempC)}C.`;
}

/**
 * Map a free-text weather condition (Google's `description.text`, e.g. "Mostly
 * sunny", "Light rain showers") to a lucide-icon key the brief understands.
 * Falls back to `cloud-sun` — the most common Sydney morning.
 */
export function weatherGlyph(condition: string): string {
	const c = condition.toLowerCase();
	if (/thunder|lightning|storm/.test(c)) return 'cloud-lightning';
	if (/snow|sleet|flurr|hail|ice/.test(c)) return 'cloud-snow';
	if (/drizzle/.test(c)) return 'cloud-drizzle';
	if (/(light|isolated|scattered|patchy|few)\b.*\b(rain|shower)/.test(c)) return 'cloud-drizzle';
	if (/rain|shower/.test(c)) return 'cloud-rain';
	if (/fog|mist|haz/.test(c)) return 'cloud-fog';
	if (/wind|breez|gust/.test(c)) return 'wind';
	if (/partly|mostly|partial|intermittent/.test(c) && /cloud|sun|clear/.test(c)) return 'cloud-sun';
	if (/overcast|cloud/.test(c)) return 'cloudy';
	if (/sun|clear|fair/.test(c)) return 'sun';
	return 'cloud-sun';
}

/** Min/max temperature for the rest of today (Sydney local). */
export function todayRange(
	hourly: ForecastHour[],
	now: Date = new Date()
): { minC: number; maxC: number } | null {
	const todayKey = sydneyYMD(now);
	const future = hourly.filter(
		(h) => sydneyYMD(h.at) === todayKey && h.at.getTime() >= now.getTime()
	);
	if (future.length === 0) return null;
	const temps = future.map((h) => h.tempC);
	return { minC: Math.min(...temps), maxC: Math.max(...temps) };
}

// ────────────────────────────────────────────────────────────────────────────

export interface DayForecast {
	dateKey: string;
	weekday: string;
	label: string;
	blocks: Partial<Record<BlockName, DayBlock>>;
}

/** Block start hour for a name. Inverse of how groupByDayBlocks classifies. */
export function blockStartHour(name: BlockName): number {
	return name === 'Night' ? 0 : name === 'Morning' ? 6 : name === 'Noon' ? 12 : 18;
}

/**
 * Block names that are in the past for the given day, given the current
 * Sydney moment. Used by the /weather UI to dim cells we'll never have
 * data for (the API returns 48h going forward only).
 */
export function pastBlocksFor(dateKey: string, now: Date = new Date()): BlockName[] {
	const todayKey = sydneyYMD(now);
	const all: BlockName[] = ['Night', 'Morning', 'Noon', 'Evening'];
	if (dateKey > todayKey) return [];
	if (dateKey < todayKey) return all;
	const currentHour = sydneyHour(now);
	return all.filter((b) => currentHour >= blockStartHour(b) + 6);
}

/**
 * Tomorrow's headline. Same priority order as weatherSummary minus
 * "rain in next N min" (irrelevant for tomorrow) and UV (current-only).
 * Returns null if we have no hourly data for tomorrow.
 */
export function tomorrowSummary(
	weather: Weather,
	thresholds: Partial<WeatherThresholds> = {},
	now: Date = new Date()
): string | null {
	const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
	const tomorrowKey = sydneyYMD(new Date(now.getTime() + 24 * 60 * 60 * 1000));
	const hours = weather.hourly.filter((h) => sydneyYMD(h.at) === tomorrowKey);
	if (hours.length === 0) return null;

	// Rain — first hour above threshold
	const firstRain = hours.find((h) => h.rainPct >= t.rainPctSoon);
	if (firstRain) {
		return `Tomorrow: rain by ${sydneyTimeCompact(firstRain.at)} (${firstRain.rainPct}%).`;
	}

	const temps = hours.map((h) => h.tempC);
	const maxC = Math.max(...temps);
	const minC = Math.min(...temps);

	if (maxC < t.coldC) return `Tomorrow: cold, peak ${Math.round(maxC)}C.`;
	if (maxC > t.hotC) return `Tomorrow: hot, peaks ${Math.round(maxC)}C.`;

	const peakWind = Math.max(...hours.map((h) => h.windKmh));
	if (peakWind > t.windyKmh) return `Tomorrow: windy, ${Math.round(peakWind)} km/h.`;

	const dominantCond = dominant(hours.map((h) => h.condition));
	return `Tomorrow: ${dominantCond}, ${Math.round(minC)}-${Math.round(maxC)}C.`;
}

/** Re-group flat day-blocks into per-day rows for the /weather grid. */
export function groupByDay(blocks: DayBlock[]): DayForecast[] {
	const m = new Map<string, DayForecast>();
	for (const b of blocks) {
		if (!m.has(b.dateKey)) {
			m.set(b.dateKey, {
				dateKey: b.dateKey,
				weekday: b.weekday,
				label: b.dayLabel,
				blocks: {}
			});
		}
		m.get(b.dateKey)!.blocks[b.block] = b;
	}
	return Array.from(m.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}
