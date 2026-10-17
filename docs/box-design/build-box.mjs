import { renderBox, W, D, H, cutList } from './box.mjs';
import { writeFileSync } from 'fs';
const d = new URL('.', import.meta.url).pathname;
const states = {
	'box-closed': {},
	'box-open': { lid: 110 },
	'box-all': { lid: 110, flap: 105, plid: 95 },
	'box-xray': { lid: 0, xray: true },
	'box-mid': { lid: 60, flap: 50 }
};
for (const [k, v] of Object.entries(states)) writeFileSync(d + k + '.svg', renderBox(v).svg);
console.log(W, D, H);
console.table(cutList().map((c) => ({ ...c, size: c.size.join('×') })));
