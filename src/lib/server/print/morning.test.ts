import { describe, it, expect } from 'vitest';
import { pickAroundTarget, rainSummaryToday } from './morning';
import { cleanListName } from '$lib/server/tools/ticktick';
import { wrapItems } from './sections';
import type { BusDeparture } from '$lib/server/tools/bus';
import type { ForecastHour } from '$lib/server/tools/weather';

function dep(isoTime: string, route = '501', dueMins = 0): BusDeparture {
	const d = new Date(isoTime);
	return {
		route,
		destination: 'Test',
		dueMins,
		realtime: true,
		cancelled: false,
		scheduledAt: d,
		estimatedAt: d
	};
}

describe('pickAroundTarget', () => {
	const target = new Date('2026-05-09T22:00:00Z'); // = 10 May 08:00 Sydney AEST

	it('returns one before, closest, and one after', () => {
		const result = pickAroundTarget(
			[
				dep('2026-05-09T21:50:00Z'), // -10 min
				dep('2026-05-09T21:55:00Z'), // -5 min ← before
				dep('2026-05-09T22:02:00Z'), // +2 min ← closest
				dep('2026-05-09T22:10:00Z'), // +10 min ← after
				dep('2026-05-09T22:25:00Z') // +25 min
			],
			target
		);

		expect(result).toHaveLength(3);
		expect(result[0].estimatedAt.toISOString()).toBe('2026-05-09T21:55:00.000Z');
		expect(result[1].estimatedAt.toISOString()).toBe('2026-05-09T22:02:00.000Z');
		expect(result[2].estimatedAt.toISOString()).toBe('2026-05-09T22:10:00.000Z');
	});

	it('returns empty when no departures', () => {
		expect(pickAroundTarget([], target)).toEqual([]);
	});

	it('returns 2 when no departure exists before the target', () => {
		// All buses are after target — no "before" slot
		const result = pickAroundTarget(
			[
				dep('2026-05-09T22:05:00Z'), // closest, after target
				dep('2026-05-09T22:20:00Z') // after-after
			],
			target
		);
		expect(result).toHaveLength(2);
		expect(result[0].estimatedAt.toISOString()).toBe('2026-05-09T22:05:00.000Z');
		expect(result[1].estimatedAt.toISOString()).toBe('2026-05-09T22:20:00.000Z');
	});

	it('returns 2 when no departure exists after the closest', () => {
		// All buses are before target — closest is the last one
		const result = pickAroundTarget(
			[
				dep('2026-05-09T21:30:00Z'), // -30 min ← before
				dep('2026-05-09T21:55:00Z') // -5 min ← closest (last)
			],
			target
		);
		expect(result).toHaveLength(2);
		expect(result[0].estimatedAt.toISOString()).toBe('2026-05-09T21:30:00.000Z');
		expect(result[1].estimatedAt.toISOString()).toBe('2026-05-09T21:55:00.000Z');
	});

	it('returns 1 when only one departure exists', () => {
		const result = pickAroundTarget([dep('2026-05-09T22:00:00Z')], target);
		expect(result).toHaveLength(1);
	});

	it('handles unsorted input', () => {
		const result = pickAroundTarget(
			[
				dep('2026-05-09T22:10:00Z'),
				dep('2026-05-09T21:55:00Z'),
				dep('2026-05-09T22:02:00Z')
			],
			target
		);
		expect(result.map((d) => d.estimatedAt.toISOString())).toEqual([
			'2026-05-09T21:55:00.000Z',
			'2026-05-09T22:02:00.000Z',
			'2026-05-09T22:10:00.000Z'
		]);
	});
});

// ────────────────────────────────────────────────────────────────────────────
// rainSummaryToday — Sydney May = AEST (+10:00).
// Helper builds the 12 hourly slots covering 7am-6pm Sydney for 2026-05-10.
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

describe('wrapItems', () => {
	it('returns empty for empty input', () => {
		expect(wrapItems([], 40, '  ')).toEqual([]);
	});

	it('fits everything on one line when short', () => {
		expect(wrapItems(['eggs', 'milk'], 40, '  ')).toEqual(['  eggs, milk']);
	});

	it('wraps when exceeding maxWidth', () => {
		const items = ['oat milk', 'eggs', 'bananas', 'butter', 'sourdough', 'paper towels'];
		const lines = wrapItems(items, 30, '  ');
		// Each line max 30 chars, 2-space indent
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(30);
		// Round-trip
		expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(items.join(', '));
	});

	it('does not append a trailing comma', () => {
		const items = ['a', 'b', 'c'];
		const lines = wrapItems(items, 40, '');
		expect(lines.join(' ')).toBe('a, b, c');
	});

	it('places a long single item on its own line', () => {
		const items = ['short', 'this-is-a-really-quite-long-single-item', 'short'];
		const lines = wrapItems(items, 20, '  ');
		expect(lines).toContain('  this-is-a-really-quite-long-single-item,');
	});
});

describe('cleanListName', () => {
	it('strips a leading emoji TickTick glues onto the name', () => {
		expect(cleanListName('🛒Shopping')).toBe('Shopping');
	});

	it('strips a leading emoji + space', () => {
		expect(cleanListName('📖 Read')).toBe('Read');
	});

	it('leaves a plain name (and trims surrounding whitespace)', () => {
		expect(cleanListName('Shopping')).toBe('Shopping');
		expect(cleanListName('  Notes  ')).toBe('Notes');
	});

	it('keeps multi-word names after the emoji', () => {
		expect(cleanListName('🎬Watch List')).toBe('Watch List');
	});

	it('does not strip a leading digit (it is alphanumeric)', () => {
		expect(cleanListName('2024 Goals')).toBe('2024 Goals');
	});
});
