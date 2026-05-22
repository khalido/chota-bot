/**
 * Weather *formatting* for the print briefs — the GUS-style ASCII block.
 *
 * The data layer (fetch, cache, typed `Weather`) is `tools/weather.ts`; this
 * file is presentation only — it turns a `Weather` into the receipt lines +
 * lucide icon a brief shows. `weatherBlock()` is the entry point `gatherBrief`
 * calls; everything else supports it.
 */
import { getConfig } from '$lib/server/config';
import {
	weatherGlyph,
	todayRange,
	tomorrowSummary,
	DEFAULT_THRESHOLDS,
	type ForecastHour,
	type Weather
} from '$lib/server/tools/weather';
import { sydneyHour, sydneyTimeOnDay, sydneyYMD } from '$lib/time';
import type { WeatherThresholds } from '$lib/config';

export interface WeatherBlock {
	/** Pre-formatted compact weather lines, or null if there's nothing to show. */
	lines: string[] | null;
	/** lucide-icon key for the condition (see `weatherGlyph`), or null. */
	icon: string | null;
}

/**
 * The weather section — formatted lines + icon — for the brief's `day`.
 * `'today'` uses the current conditions; `'tomorrow'` (the evening print) the
 * forecast for tomorrow. `now` is the real clock either way.
 */
export function weatherBlock(
	weather: Weather,
	day: 'today' | 'tomorrow',
	now: Date = new Date()
): WeatherBlock {
	if (day === 'tomorrow') {
		const hours = tomorrowHours(weather, now);
		const lines = formatTomorrowWeather(weather, now);
		return {
			lines: lines.length ? lines : null,
			icon: hours.length ? weatherGlyph(dominantCondition(hours)) : null
		};
	}
	return { lines: formatGusWeather(weather, now), icon: weatherGlyph(weather.condition) };
}

// ────────────────────────────────────────────────────────────────────────────
// GUS-style weather block.
// ────────────────────────────────────────────────────────────────────────────

/**
 * GUS-inspired weather block. Rain block only appears when the day actually
 * has actionable rain in the 7am-7pm window (otherwise we don't waste a line).
 *
 *   [ MOSTLY SUNNY ]
 *   21 C now
 *
 *   rain 2-4pm
 *   ..::==##::..
 *
 *   -> Mostly sunny, 17-20C today.
 */
export function formatGusWeather(weather: Weather, now: Date = new Date()): string[] {
	const lines: string[] = [];
	const feelsGap = Math.abs(weather.feelsLikeC - weather.tempC) >= 3;
	const nowBit = `${Math.round(weather.tempC)}C now${feelsGap ? ` (feels ${Math.round(weather.feelsLikeC)}C)` : ''}`;
	lines.push(`[ ${weather.condition.toUpperCase()} ]  ${nowBit}`);

	// Rain — always show something. A notable run gets the window + sparkline;
	// otherwise just the peak chance, highlighting roughly when it's likeliest.
	const thresholds = getConfig().home?.weather;
	const rain = rainSummaryToday(weather.hourly, now, thresholds);
	if (rain) {
		lines.push(`${rain.text}  ${rain.sparkline}`);
	} else {
		const peak = rainPeakTodayWindow(weather.hourly, now);
		if (peak) {
			lines.push(
				peak.pct >= 25
					? `rain ${peak.pct}% chance, peaks ~${formatHourShort(peak.atHour)}`
					: `rain ${peak.pct}% chance today`
			);
		}
	}

	// Summary line — additive only (no condition repeat): today's range, wind, UV.
	const range = todayRange(weather.hourly, now);
	const bits: string[] = [];
	if (range) bits.push(`${Math.round(range.minC)}-${Math.round(range.maxC)}C today`);
	bits.push(`wind ${Math.round(weather.windKmh)}km/h`);
	if (weather.uvIndex >= 3) bits.push(`UV ${Math.round(weather.uvIndex)}`);
	lines.push(`-> ${bits.join(', ')}`);

	// One short line for tomorrow (condition + range, or rain onset). It is a
	// distinct line about a different day, so it deliberately *doesn't* carry
	// the "-> " arrow the today bullets use — renderers key off the "tmrw:"
	// prefix to set it apart.
	const tm = tomorrowSummary(weather, thresholds, now);
	if (tm) {
		lines.push(
			`tmrw: ${tm
				.replace(/^Tomorrow:\s*/, '')
				.replace(/\.$/, '')
				.replace(/^./, (c) => c.toLowerCase())}`
		);
	}
	return lines;
}

/**
 * Tomorrow's weather block for the evening print. Reuses the today rain helpers
 * with tomorrow as the reference day. There's no "X now" line — a future day
 * has no "now" — so the headline is the dominant condition + the full-day
 * range, and the trailing "-> tmrw" is dropped (it'd be the day *after*).
 *
 *   [ PARTLY CLOUDY ]  14-23C
 *   rain 7-9am  ##::..
 *   -> wind to 28km/h
 *
 * Empty array when the 48h forecast doesn't reach tomorrow.
 */
export function formatTomorrowWeather(weather: Weather, now: Date = new Date()): string[] {
	const hours = tomorrowHours(weather, now);
	if (hours.length === 0) return [];

	const temps = hours.map((h) => h.tempC);
	const lo = Math.round(Math.min(...temps));
	const hi = Math.round(Math.max(...temps));
	const lines = [`[ ${dominantCondition(hours).toUpperCase()} ]  ${lo}-${hi}C`];

	// Rain — same window logic as today, anchored at midday tomorrow so the
	// 7am-7pm window resolves to the right day.
	const thresholds = getConfig().home?.weather;
	const anchor = sydneyTimeOnDay('12:00', new Date(now.getTime() + 86_400_000));
	const rain = rainSummaryToday(weather.hourly, anchor, thresholds);
	if (rain) {
		lines.push(`${rain.text}  ${rain.sparkline}`);
	} else {
		const peak = rainPeakTodayWindow(weather.hourly, anchor);
		if (peak) {
			lines.push(
				peak.pct >= 25
					? `rain ${peak.pct}% chance, peaks ~${formatHourShort(peak.atHour)}`
					: `rain ${peak.pct}% chance`
			);
		}
	}

	const peakWind = Math.max(...hours.map((h) => h.windKmh));
	if (peakWind > 0) lines.push(`-> wind to ${Math.round(peakWind)}km/h`);
	return lines;
}

/** Tomorrow's forecast hours (Sydney local) — the single source of "which hours are tomorrow". */
function tomorrowHours(weather: Weather, now: Date): ForecastHour[] {
	const tomKey = sydneyYMD(new Date(now.getTime() + 86_400_000));
	return weather.hourly.filter((h) => sydneyYMD(h.at) === tomKey);
}

/** Most-frequent weather condition across a set of forecast hours. */
function dominantCondition(hours: ForecastHour[]): string {
	const counts = new Map<string, number>();
	for (const h of hours) counts.set(h.condition, (counts.get(h.condition) ?? 0) + 1);
	let best = hours[0]?.condition ?? 'Unknown';
	let max = 0;
	for (const [k, v] of counts) {
		if (v > max) {
			max = v;
			best = k;
		}
	}
	return best;
}

/** Peak rain probability in today's 7am-7pm Sydney window + the hour it peaks; null if no data. */
export function rainPeakTodayWindow(
	hourly: ForecastHour[],
	now: Date = new Date()
): { pct: number; atHour: number } | null {
	const todayKey = sydneyYMD(now);
	const windowHours = hourly
		.filter((h) => sydneyYMD(h.at) === todayKey)
		.filter((h) => {
			const hr = sydneyHour(h.at);
			return hr >= RAIN_WINDOW_START_HR && hr < RAIN_WINDOW_END_HR;
		});
	if (windowHours.length === 0) return null;
	let best = windowHours[0];
	for (const h of windowHours) if (h.rainPct > best.rainPct) best = h;
	return { pct: Math.round(best.rainPct), atHour: sydneyHour(best.at) };
}

// ────────────────────────────────────────────────────────────────────────────
// Rain summary: an actionable text line + sparkline. Exported for tests.
// ────────────────────────────────────────────────────────────────────────────

/** "Out and about" hours: 7am inclusive → 7pm exclusive (Sydney local). */
export const RAIN_WINDOW_START_HR = 7;
export const RAIN_WINDOW_END_HR = 19;

export interface RainSummary {
	/** Actionable label, e.g. "rain 2-4pm" or "rain most of the day". */
	text: string;
	/** Density sparkline across the available window hours. */
	sparkline: string;
}

/**
 * Returns null when no hour in the 7am-7pm window today reaches the
 * threshold — caller should skip the block entirely on dry days.
 */
export function rainSummaryToday(
	hourly: ForecastHour[],
	now: Date = new Date(),
	thresholds: Partial<WeatherThresholds> = {}
): RainSummary | null {
	const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
	const todayKey = sydneyYMD(now);
	const windowHours = hourly
		.filter((h) => sydneyYMD(h.at) === todayKey)
		.filter((h) => {
			const hr = sydneyHour(h.at);
			return hr >= RAIN_WINDOW_START_HR && hr < RAIN_WINDOW_END_HR;
		})
		.sort((a, b) => a.at.getTime() - b.at.getTime());

	if (windowHours.length === 0) return null;
	if (!windowHours.some((h) => h.rainPct >= t.rainPctSoon)) return null;

	const sparkline = windowHours.map((h) => sparkChar(h.rainPct)).join('');

	const wetHours = windowHours.filter((h) => h.rainPct >= t.rainPctSoon);
	const runs = findRuns(wetHours.map((h) => sydneyHour(h.at)));
	const totalWet = runs.reduce((s, r) => s + (r.end - r.start + 1), 0);

	let text: string;
	if (totalWet === windowHours.length) text = 'rain all day';
	else if (totalWet >= Math.ceil(windowHours.length * 0.75)) text = 'rain most of the day';
	else if (runs.length >= 3) text = 'showers throughout';
	else text = `rain ${runs.map((r) => formatHourRange(r.start, r.end)).join(' and ')}`;

	return { text, sparkline };
}

function sparkChar(pct: number): string {
	if (pct <= 0) return ' ';
	if (pct < 20) return '.';
	if (pct < 40) return ':';
	if (pct < 60) return '=';
	if (pct < 80) return '#';
	return '%';
}

function findRuns(hours: number[]): { start: number; end: number }[] {
	if (hours.length === 0) return [];
	const sorted = [...hours].sort((a, b) => a - b);
	const runs: { start: number; end: number }[] = [];
	let start = sorted[0];
	let end = start;
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i] === end + 1) end = sorted[i];
		else {
			runs.push({ start, end });
			start = sorted[i];
			end = start;
		}
	}
	runs.push({ start, end });
	return runs;
}

function formatHourRange(start: number, end: number): string {
	if (start === end) return formatHourShort(start);
	const startSuffix = start < 12 ? 'am' : 'pm';
	const endSuffix = end < 12 ? 'am' : 'pm';
	if (startSuffix === endSuffix) {
		return `${displayHour(start)}-${displayHour(end)}${endSuffix}`;
	}
	return `${formatHourShort(start)}-${formatHourShort(end)}`;
}

function formatHourShort(hr: number): string {
	const suffix = hr < 12 ? 'am' : 'pm';
	return `${displayHour(hr)}${suffix}`;
}

function displayHour(hr: number): number {
	if (hr === 0) return 12;
	if (hr <= 12) return hr;
	return hr - 12;
}
