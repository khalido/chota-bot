import { describe, it, expect } from 'vitest';
import { pickAroundTarget } from './brief';
import { cleanListName } from '$lib/server/tools/ticktick';
import { wrapItems } from './sections';
import type { BusDeparture } from '$lib/server/tools/bus';

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
			[dep('2026-05-09T22:10:00Z'), dep('2026-05-09T21:55:00Z'), dep('2026-05-09T22:02:00Z')],
			target
		);
		expect(result.map((d) => d.estimatedAt.toISOString())).toEqual([
			'2026-05-09T21:55:00.000Z',
			'2026-05-09T22:02:00.000Z',
			'2026-05-09T22:10:00.000Z'
		]);
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
