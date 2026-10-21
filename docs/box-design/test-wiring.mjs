// Checks the wiring checks: the real data is clean for v1 and for everything, and broken copies trip them.
// Usage: node docs/box-design/test-wiring.mjs
import assert from 'node:assert/strict';
import * as wiring from './wiring.mjs';
import { runChecks } from './wiring-checks.mjs';

const clone = () => structuredClone({ boards: wiring.boards, parts: wiring.parts, limits: wiring.limits, links: wiring.links, piPorts: wiring.piPorts });
const run = (data, phase) => runChecks(data, data.parts.filter((p) => phase === 'all' || p.phase === phase));
const bad = (r) => r.clashes.filter((c) => c.level !== 'ok').map((c) => c.text);
const part = (d, id) => d.parts.find((p) => p.id === id);

for (const phase of ['v1', 'all']) {
	const r = run(clone(), phase);
	assert.deepEqual(bad(r), [], `${phase} should be clean`);
	assert.ok(r.rails.every((x) => x.level === 'ok'), `${phase} rails should be ok`);
}

assert.deepEqual(bad(run(clone(), 'later')).length, 1, 'later alone only warns that the strip\'s shifter is hidden');

let d = clone();
part(d, 'print-button').pins[0].to = 24; // the e-ink's CS pin
let r = bad(run(d, 'all'));
assert.ok(r.some((t) => /Two wires on one pin/.test(t)) && r.some((t) => /plain GPIO/.test(t)), 'pin clash and bus clash');

d = clone();
part(d, 'volume').pins[2].to = 26; // SPI0 CE1 as plain GPIO while the e-ink is on SPI0
assert.ok(bad(run(d, 'all')).some((t) => /plain GPIO/.test(t)), 'bus clash');

d = clone();
Object.assign(part(d, 'face').pins[0], { to: 31, via: undefined });
assert.ok(bad(run(d, 'v1')).some((t) => /no level shifter/.test(t)), '5 V logic');

d = clone();
part(d, 'lid-screen').currentMa = 3600;
assert.ok(run(d, 'v1').rails.some((x) => x.id === 'pi5v' && x.level === 'bad'), '5 V rail');

d = clone();
d.links.push({ a: 'printer:USB-B', b: 'pi:nope', kind: 'usb', status: 'proposed', note: '' });
assert.ok(bad(run(d, 'v1')).some((t) => /no Pi port/.test(t)), 'bad link');
console.log('wiring checks ok');
