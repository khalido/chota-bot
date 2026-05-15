/**
 * Monospace word-wrap shared by the text-print path and the image renderer.
 * The composer emits semantic lines; each consumer wraps to its own column
 * width (Font A ≈ 46, Font B ≈ 62, the raster renderer ≈ whatever fits).
 */

/** Greedy word-wrap one line to `cols`; preserves leading indent on continuations; hard-breaks oversized tokens. */
export function wrapLine(line: string, cols: number): string[] {
	if (line.length <= cols) return [line];
	const indent = /^ */.exec(line)?.[0] ?? '';
	const inner = Math.max(1, cols - indent.length);
	const words = line.slice(indent.length).split(' ');
	const out: string[] = [];
	let cur = '';
	const flush = () => {
		out.push(indent + cur);
		cur = '';
	};
	for (let w of words) {
		while (w.length > inner) {
			if (cur) flush();
			out.push(indent + w.slice(0, inner));
			w = w.slice(inner);
		}
		if (cur === '') cur = w;
		else if (cur.length + 1 + w.length <= inner) cur += ' ' + w;
		else {
			flush();
			cur = w;
		}
	}
	if (cur || out.length === 0) flush();
	return out;
}
