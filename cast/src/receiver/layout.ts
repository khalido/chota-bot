// Where each block of a screen goes on its grid, and how much to shrink it. Blocks are designed for a whole screen;
// a smaller cell shows the same block smaller (CSS zoom), by its share of the screen's height and width. Placement
// follows CSS grid's row-by-row auto-placement, and the page sets each cell's row and column from here, so the scale
// always matches what is drawn.

export type Cell = { row: number; col: number; rows: number; cols: number; zoom: number };

/** A cell's zoom from its share of the height and width: 1 for the whole screen, about 0.66 for half its height. */
const zoomFor = (h: number, w: number) => Math.min(1, 0.32 + 0.68 * h, 0.6 + 0.7 * w);

export function layout(
	blocks: { span?: number; rows?: number }[],
	columns = 2,
	rowWeights: number[] = []
): { cells: Cell[]; rows: number[] } {
	const taken: boolean[][] = [];
	const free = (r: number, c: number, rs: number, cs: number) => {
		for (let i = r; i < r + rs; i++)
			for (let j = c; j < c + cs; j++) if (taken[i]?.[j]) return false;
		return true;
	};
	let cursor = { r: 0, c: 0 };
	const placed = blocks.map((b) => {
		const cs = Math.min(b.span ?? 1, columns);
		const rs = b.rows ?? 1;
		let { r, c } = cursor;
		while (c + cs > columns || !free(r, c, rs, cs)) {
			c++;
			if (c + cs > columns) {
				c = 0;
				r++;
			}
		}
		for (let i = r; i < r + rs; i++) for (let j = c; j < c + cs; j++) (taken[i] ??= [])[j] = true;
		cursor = { r, c: c + cs };
		return { row: r, col: c, rows: rs, cols: cs };
	});
	const count = Math.max(1, taken.length);
	const rows = Array.from({ length: count }, (_, i) => rowWeights[i] ?? 1);
	const total = rows.reduce((a, b) => a + b, 0);
	const cells = placed.map((p) => {
		const h = rows.slice(p.row, p.row + p.rows).reduce((a, b) => a + b, 0) / total;
		return { ...p, zoom: zoomFor(h, p.cols / columns) };
	});
	return { cells, rows };
}
