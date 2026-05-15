import { describe, it, expect } from 'vitest';
import {
	groupByDay,
	pastBlocksFor,
	tomorrowSummary,
	weatherSummary,
	type ForecastHour,
	type Weather
} from './weather';

const NOW = new Date('2026-05-09T22:00:00Z'); // 10 May 08:00 Sydney

function hour(isoUtc: string, partial: Partial<ForecastHour> = {}): ForecastHour {
	return {
		at: new Date(isoUtc),
		tempC: 18,
		condition: 'Clear',
		rainPct: 0,
		rainMm: 0,
		windKmh: 5,
		...partial
	};
}

function weather(overrides: Partial<Weather> = {}): Weather {
	return {
		tempC: 18,
		feelsLikeC: 18,
		condition: 'Clear',
		humidityPct: 60,
		windKmh: 5,
		uvIndex: 1,
		hourly: [],
		...overrides
	};
}

describe('weatherSummary — rule priority', () => {
	it('rain soon (under 60 min) wins over UV / temp / wind', () => {
		const result = weatherSummary(
			weather({
				uvIndex: 11, // would otherwise trigger UV rule
				windKmh: 50, // would otherwise trigger wind rule
				hourly: [
					hour('2026-05-09T22:30:00Z', { rainPct: 80 }) // 30 min from NOW
				]
			}),
			{},
			NOW
		);
		expect(result).toContain('Rain in');
		expect(result).toContain('30 min');
	});

	it('rain over 60 min uses compact 12h format', () => {
		const result = weatherSummary(
			weather({
				hourly: [hour('2026-05-09T23:30:00Z', { rainPct: 80 })] // 90 min from NOW
			}),
			{},
			NOW
		);
		expect(result).toMatch(/Rain by \d{1,2}(:\d{2})?(am|pm)/);
		expect(result).toContain('80%');
	});

	it('UV high wins when no rain', () => {
		const result = weatherSummary(
			weather({
				uvIndex: 11,
				windKmh: 50, // would otherwise trigger wind
				hourly: [hour('2026-05-09T22:30:00Z', { tempC: 20 })]
			}),
			{},
			NOW
		);
		expect(result).toContain('UV 11');
		expect(result).toContain('sunscreen');
	});

	it('cold day wins when no rain or UV', () => {
		const result = weatherSummary(
			weather({
				uvIndex: 1,
				hourly: [
					hour('2026-05-09T22:30:00Z', { tempC: 8 }),
					hour('2026-05-09T23:30:00Z', { tempC: 10 })
				]
			}),
			{},
			NOW
		);
		expect(result).toContain('Cold');
		expect(result).toContain('10C');
	});

	it('hot day wins when no rain or UV', () => {
		const result = weatherSummary(
			weather({
				uvIndex: 1,
				hourly: [
					hour('2026-05-09T22:30:00Z', { tempC: 32 }),
					hour('2026-05-09T23:30:00Z', { tempC: 35 })
				]
			}),
			{},
			NOW
		);
		expect(result).toContain('Hot');
		expect(result).toContain('35C');
	});

	it('windy wins when nothing else triggers', () => {
		const result = weatherSummary(
			weather({
				windKmh: 45,
				hourly: [hour('2026-05-09T22:30:00Z', { tempC: 20 })]
			}),
			{},
			NOW
		);
		expect(result).toBe('Windy, 45 km/h.');
	});

	it('default headline shows condition + range', () => {
		const result = weatherSummary(
			weather({
				condition: 'Sunny',
				hourly: [
					hour('2026-05-09T22:30:00Z', { tempC: 14 }),
					hour('2026-05-09T23:30:00Z', { tempC: 22 })
				]
			}),
			{},
			NOW
		);
		expect(result).toBe('Sunny, 14-22C today.');
	});

	it('falls back to current temp when no hourly data', () => {
		const result = weatherSummary(weather({ condition: 'Clear', tempC: 16 }), {}, NOW);
		expect(result).toBe('Clear, 16C.');
	});

	it('threshold overrides change the rule trigger', () => {
		// With default coldC=12, max 14 is NOT cold. With coldC=15, it IS.
		const w = weather({
			hourly: [hour('2026-05-09T22:30:00Z', { tempC: 14 })]
		});
		expect(weatherSummary(w, {}, NOW)).not.toContain('Cold');
		expect(weatherSummary(w, { coldC: 15 }, NOW)).toContain('Cold');
	});
});

describe('pastBlocksFor', () => {
	// NOW = 10 May 08:00 Sydney AEST (= 9 May 22:00 UTC)
	it('returns no past blocks for a future date', () => {
		expect(pastBlocksFor('2026-05-11', NOW)).toEqual([]);
	});

	it('returns all blocks past for a date before today', () => {
		expect(pastBlocksFor('2026-05-09', NOW)).toEqual(['Night', 'Morning', 'Noon', 'Evening']);
	});

	it('returns past blocks based on current Sydney hour for today', () => {
		// At 08:00 Sydney, Night (0-5) is past, Morning (6-11) NOT past (still ongoing)
		expect(pastBlocksFor('2026-05-10', NOW)).toEqual(['Night']);

		// At 14:00 Sydney = 04:00 UTC same day
		const noonish = new Date('2026-05-10T04:00:00Z');
		expect(pastBlocksFor('2026-05-10', noonish)).toEqual(['Night', 'Morning']);

		// At 19:00 Sydney = 09:00 UTC, Noon (12-17) is past
		const evening = new Date('2026-05-10T09:00:00Z');
		expect(pastBlocksFor('2026-05-10', evening)).toEqual(['Night', 'Morning', 'Noon']);
	});
});

describe('tomorrowSummary', () => {
	it('returns null when no hourly data for tomorrow', () => {
		const w = weather({ hourly: [hour('2026-05-09T22:00:00Z', { tempC: 18 })] });
		expect(tomorrowSummary(w, {}, NOW)).toBeNull();
	});

	it('rain-by headline when tomorrow has rain', () => {
		// Tomorrow Sydney = 11 May. Add an hour at 11 May 04:00 Sydney = 10 May 18:00 UTC.
		const w = weather({
			hourly: [
				hour('2026-05-10T18:00:00Z', { tempC: 14, rainPct: 0 }), // 04:00 Sydney 11 May
				hour('2026-05-11T00:00:00Z', { tempC: 16, rainPct: 80 }) // 10:00 Sydney 11 May
			]
		});
		const result = tomorrowSummary(w, {}, NOW);
		expect(result).toContain('Tomorrow: rain by');
		expect(result).toContain('80%');
	});

	it('cold headline when tomorrow max < threshold', () => {
		const w = weather({
			hourly: [
				hour('2026-05-10T18:00:00Z', { tempC: 8 }), // 04:00 Sydney 11 May
				hour('2026-05-10T22:00:00Z', { tempC: 11 }) // 08:00 Sydney 11 May
			]
		});
		expect(tomorrowSummary(w, {}, NOW)).toContain('Tomorrow: cold');
	});

	it('default headline includes condition + range', () => {
		const w = weather({
			hourly: [
				hour('2026-05-10T18:00:00Z', { tempC: 14, condition: 'Sunny' }),
				hour('2026-05-10T22:00:00Z', { tempC: 22, condition: 'Sunny' })
			]
		});
		const result = tomorrowSummary(w, {}, NOW);
		expect(result).toBe('Tomorrow: Sunny, 14-22C.');
	});
});

describe('groupByDay', () => {
	it('groups flat blocks into per-day rows with block keys', () => {
		const blocks = [
			{
				dateKey: '2026-05-10',
				weekday: 'Sun',
				dayLabel: 'Sun 10 May',
				block: 'Morning' as const,
				startHour: 6,
				tempC: 16,
				tempMaxC: 17,
				tempMinC: 15,
				condition: 'Sunny',
				rainPct: 0,
				rainMm: 0,
				windKmh: 5,
				hours: []
			},
			{
				dateKey: '2026-05-10',
				weekday: 'Sun',
				dayLabel: 'Sun 10 May',
				block: 'Noon' as const,
				startHour: 12,
				tempC: 19,
				tempMaxC: 20,
				tempMinC: 18,
				condition: 'Sunny',
				rainPct: 0,
				rainMm: 0,
				windKmh: 6,
				hours: []
			},
			{
				dateKey: '2026-05-11',
				weekday: 'Mon',
				dayLabel: 'Mon 11 May',
				block: 'Morning' as const,
				startHour: 6,
				tempC: 17,
				tempMaxC: 18,
				tempMinC: 16,
				condition: 'Patchy rain',
				rainPct: 84,
				rainMm: 0.4,
				windKmh: 8,
				hours: []
			}
		];

		const days = groupByDay(blocks);
		expect(days).toHaveLength(2);
		expect(days[0].dateKey).toBe('2026-05-10');
		expect(days[0].blocks.Morning?.tempC).toBe(16);
		expect(days[0].blocks.Noon?.tempC).toBe(19);
		expect(days[0].blocks.Evening).toBeUndefined();
		expect(days[1].dateKey).toBe('2026-05-11');
		expect(days[1].blocks.Morning?.condition).toBe('Patchy rain');
	});
});
