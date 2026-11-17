import { describe, expect, it } from 'vitest';
import { layout } from './layout.ts';

describe('layout', () => {
	it('fills rows left to right and scales a 2×2 grid to about two thirds', () => {
		const { cells, rows } = layout([{}, {}, {}, {}], 2);
		expect(cells.map((c) => [c.row, c.col])).toEqual([
			[0, 0],
			[0, 1],
			[1, 0],
			[1, 1]
		]);
		expect(rows).toEqual([1, 1]);
		expect(cells[0].zoom).toBeCloseTo(0.66);
	});

	it('gives a lone block the whole screen at full size', () => {
		expect(layout([{}], 1).cells[0]).toEqual({ row: 0, col: 0, rows: 1, cols: 1, zoom: 1 });
	});

	it('places the briefing: a wide hero, then three in the shorter second row', () => {
		const { cells } = layout([{ span: 2 }, {}, {}, {}, {}], 3, [3, 2]);
		expect(cells.map((c) => [c.row, c.col, c.cols])).toEqual([
			[0, 0, 2],
			[0, 2, 1],
			[1, 0, 1],
			[1, 1, 1],
			[1, 2, 1]
		]);
		expect(cells[0].zoom).toBeCloseTo(0.728);
		expect(cells[2].zoom).toBeCloseTo(0.592);
	});

	it('flows around a block spanning two rows', () => {
		const { cells, rows } = layout([{ rows: 2 }, {}, {}], 2);
		expect(cells.map((c) => [c.row, c.col])).toEqual([
			[0, 0],
			[0, 1],
			[1, 1]
		]);
		expect(rows).toEqual([1, 1]);
		expect(cells[0].zoom).toBeCloseTo(0.95);
	});

	it('caps a span at the column count', () => {
		expect(layout([{ span: 4 }], 2).cells[0].cols).toBe(2);
	});
});
