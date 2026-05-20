import { describe, it, expect } from 'vitest';
import { formatTomorrowWeather, rainSummaryToday } from './weather-block';
import type { ForecastHour, Weather } from '$lib/server/tools/weather';

// ────────────────────────────────────────────────────────────────────────────
// Sydney May = AEST (+10:00). `hour()` builds slots dated 2026-05-10.
// ────────────────────────────────────────────────────────────────────────────

function hour(hr: number, rainPct: number): ForecastHour {
	return {
		at: new Date(`2026-05-10T${String(hr).padStart(2, '0')}:00:00+10:00`),
		tempC: 18,
		condition: 'Cloudy',
		rainPct,
		rainMm: 0,
		windKmh: 5
	};
}

/** Build the 12 hourly slots covering 7am-6pm Sydney with given pcts. */
function window12(pcts: number[]): ForecastHour[] {
	if (pcts.length !== 12) throw new Error('window12 needs 12 pcts');
	return pcts.map((pct, i) => hour(7 + i, pct));
}

const NOW = new Date('2026-05-10T06:00:00+10:00'); // 6am Sydney, before window starts

describe('rainSummaryToday', () => {
	it('returns null when no hour reaches threshold', () => {
		const hours = window12([30, 10, 30, 10, 30, 10, 30, 10, 30, 10, 30, 10]);
		expect(rainSummaryToday(hours, NOW)).toBeNull();
	});

	it('returns null when window has no hours (e.g. evening preview)', () => {
		expect(rainSummaryToday([], NOW)).toBeNull();
	});

	it('emits a single pm range', () => {
		// Wet at 1pm-3pm (slots 6,7,8 → hours 13,14,15)
		const hours = window12([0, 0, 0, 0, 0, 0, 70, 70, 70, 0, 0, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain 1-3pm');
		expect(result?.sparkline).toBe('      ###   ');
	});

	it('emits a mixed am-pm range', () => {
		// Wet at 11am-2pm (slots 4,5,6,7 → hours 11,12,13,14) — use 70 not 80 to stay in '#' bucket
		const hours = window12([0, 0, 0, 0, 70, 70, 70, 70, 0, 0, 0, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain 11am-2pm');
	});

	it('emits two disjoint runs joined by "and"', () => {
		// Wet 9-10am (slots 2,3) and 3-5pm (slots 8,9,10)
		const hours = window12([0, 0, 60, 60, 0, 0, 0, 0, 60, 60, 60, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain 9-10am and 3-5pm');
	});

	it('collapses 3+ runs to "showers throughout"', () => {
		// Wet at 8am (slot 1), 12pm (slot 5), 4pm (slot 9) — each isolated
		const hours = window12([0, 70, 0, 0, 0, 70, 0, 0, 0, 70, 0, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('showers throughout');
	});

	it('emits "rain all day" when every hour is wet', () => {
		const hours = window12(Array(12).fill(70));
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain all day');
		expect(result?.sparkline).toBe('############');
	});

	it('emits "rain most of the day" at >=75% wet', () => {
		// 9 of 12 hours wet — slots 0..8 (7am..3pm)
		const hours = window12([70, 70, 70, 70, 70, 70, 70, 70, 70, 0, 0, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain most of the day');
	});

	it('emits a single hour as "rain Xpm"', () => {
		// Wet at 1pm only (slot 6 → hour 13)
		const hours = window12([0, 0, 0, 0, 0, 0, 70, 0, 0, 0, 0, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.text).toBe('rain 1pm');
	});

	it('produces a density sparkline with mixed levels', () => {
		// One of each bucket: 0→' ', 10→'.', 30→':', 50→'=', 70→'#', 90→'%'
		const hours = window12([0, 10, 30, 50, 70, 90, 90, 70, 50, 30, 10, 0]);
		const result = rainSummaryToday(hours, NOW);
		expect(result?.sparkline).toBe(' .:=#%%#=:. ');
	});

	it('ignores rain outside the 7am-7pm window', () => {
		// 6am wet, but window is 7am-7pm
		const hours = [hour(6, 90), ...window12(Array(12).fill(0))];
		expect(rainSummaryToday(hours, NOW)).toBeNull();
	});
});

// ────────────────────────────────────────────────────────────────────────────
// formatTomorrowWeather — a `now` of 2026-05-09 makes the `hour()` slots
// (dated 2026-05-10) land on "tomorrow".
// ────────────────────────────────────────────────────────────────────────────

describe('formatTomorrowWeather', () => {
	const EVE = new Date('2026-05-09T19:00:00+10:00'); // evening before the hour() day
	const weather = (hourly: ForecastHour[]) => ({ hourly }) as Weather;

	it('returns [] when the 48h forecast does not reach tomorrow', () => {
		expect(formatTomorrowWeather(weather([]), EVE)).toEqual([]);
	});

	it('headlines with the dominant condition and the full-day range', () => {
		const hours = window12(Array(12).fill(0)).map((h, i) => ({ ...h, tempC: 14 + i }));
		expect(formatTomorrowWeather(weather(hours), EVE)[0]).toBe('[ CLOUDY ]  14-25C');
	});

	it('appends a peak-wind line', () => {
		const hours = window12(Array(12).fill(0)).map((h) => ({ ...h, windKmh: 22 }));
		expect(formatTomorrowWeather(weather(hours), EVE).at(-1)).toBe('-> wind to 22km/h');
	});

	it('shows "rain 0% chance" on a dry day, mirroring the morning block', () => {
		const hours = window12(Array(12).fill(0));
		expect(formatTomorrowWeather(weather(hours), EVE)).toContain('rain 0% chance');
	});
});
