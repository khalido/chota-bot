import { renderWall } from './wall.mjs';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
const DIR = dirname(fileURLToPath(import.meta.url));
const a = renderWall({ cover: true, printerLid: 0 });
const b = renderWall({ cover: false, printerLid: 1 });
const m = renderWall({ cover: false, printerLid: 0.5 });
writeFileSync(join(DIR, 'wall.svg'), a.svg);
writeFileSync(join(DIR, 'wall-open.svg'), b.svg);
writeFileSync(join(DIR, 'wall-mid.svg'), m.svg);
let n = 0;
const t2 = performance.now();
for (let i = 0; i < 100; i++) {
	renderWall({ cover: false, printerLid: i / 100 });
	n++;
}
console.log(
	'ok',
	a.svg.length,
	b.svg.length,
	'bytes;',
	((performance.now() - t2) / n).toFixed(2),
	'ms per render'
);
