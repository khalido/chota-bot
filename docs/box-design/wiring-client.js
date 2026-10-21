// Client side of wiring.html: draws the boards, wires and tables from DATA (wiring.mjs) and runs the checks.
// Inlined by build-wiring.mjs; DATA = { boards, parts, limits }.
const { boards, parts, limits } = DATA;
const NS = 'http://www.w3.org/2000/svg';
const $ = (q) => document.querySelector(q);

// h('div', {class:'x', onclick}, child, ...) for HTML; sv() for SVG.
const mk = (ns) => (tag, attrs = {}, ...kids) => {
	const e = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (v == null || v === false) continue;
		if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
		else e.setAttribute(k, v === true ? '' : v);
	}
	for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
	return e;
};
const h = mk(null),
	sv = mk(NS);

// ---- state ----
const KEY = 'chota-wiring-ticks';
let ticks = new Set();
try {
	ticks = new Set(JSON.parse(localStorage.getItem(KEY) || '[]'));
} catch {}
const saveTicks = () => {
	try {
		localStorage.setItem(KEY, JSON.stringify([...ticks]));
	} catch {}
};
const state = { tab: 'pi', phase: 'v1', hidden: new Set(), free: false, part: null, pin: null };

// ---- data helpers ----
const spaceOf = (p) => (p.board === 'pico' ? 'pico' : 'pi');
const pinOf = (space, n) => boards[space].pins.find((x) => x.n === n);
const partById = (id) => parts.find((p) => p.id === id);
const phaseOk = (p) => state.phase === 'all' || p.phase === state.phase;
const visible = (p) => phaseOk(p) && !state.hidden.has(p.id);
const wiresOf = (p) => p.pins.map((w, i) => ({ ...w, part: p, space: spaceOf(p), key: `${p.id}|${i}` }));
const tabParts = () => parts.filter((p) => (state.tab === 'pico' ? spaceOf(p) === 'pico' : spaceOf(p) === 'pi'));
const allWires = () => parts.filter(visible).flatMap(wiresOf);
const colourVar = (w) => `var(--w-${w || 'grey'})`;
const busOf = (space, pin) => {
	if (pin.type !== 'gpio') return null;
	if (space === 'pico') return pin.alts.some((a) => a.fn.startsWith('ADC')) ? 'adc' : null;
	return pin.alts.find((a) => a.bus)?.bus ?? null;
};
// Pins in use by any part of any phase, and buses in use by visible parts: for the free-pin view.
const usedAny = (space) => new Set(parts.filter((p) => spaceOf(p) === space).flatMap((p) => p.pins.map((w) => w.to).filter(Boolean)));
const busesInUse = (space, list) => new Set(list.filter((p) => spaceOf(p) === space).flatMap((p) => p.pins.map((w) => w.bus).filter(Boolean)));

// ---- checks (all computed from the data) ----
function runChecks() {
	const vis = parts.filter(visible);
	const msgs = [];
	const add = (level, text) => msgs.push({ level, text });
	const nm = (w) => `${w.part.short} ${w.partPin}`;

	for (const space of ['pi', 'pico']) {
		const board = boards[space];
		const uses = new Map();
		for (const p of vis.filter((q) => spaceOf(q) === space))
			for (const w of wiresOf(p)) if (w.to != null) uses.set(w.to, [...(uses.get(w.to) ?? []), w]);
		const inUse = busesInUse(space, vis);
		for (const [n, list] of uses) {
			const pin = pinOf(space, n);
			const label = `${board.id === 'pi' ? 'Pi' : 'Pico'} pin ${n}`;
			if (!pin) {
				add('bad', `${label} does not exist (${list.map(nm).join(', ')}).`);
				continue;
			}
			const isSignal = pin.type === 'gpio' || pin.type === 'id' || pin.type === 'ctl';
			if (isSignal && list.length > 1) add('bad', `Two wires on one pin: ${label} (${pin.name}) is used by ${list.map(nm).join(' and ')}.`);
			for (const w of list) {
				if (w.dir === 'pwr' && isSignal) add('bad', `${nm(w)} is a power wire on ${label} (${pin.name}), a signal pin.`);
				if (w.dir !== 'pwr' && !isSignal) add('bad', `${nm(w)} is a signal on ${label} (${pin.name}), a ${pin.type} pin.`);
				if (pin.type === 'id') add('bad', `${nm(w)} is on ${label} (${pin.name}), the HAT ID EEPROM. Keep GPIO 0 and 1 free.`);
				if (w.fn && !pin.alts.some((a) => a.fn === w.fn)) add('bad', `${nm(w)} wants ${w.fn}, but ${label} (${pin.name}) offers ${pin.alts.map((a) => a.fn).join(', ') || 'nothing'}.`);
				// A bus pin used as plain GPIO while that bus is in use (only where the driver takes the bus whole).
				if (board.exclusive && w.dir !== 'pwr') {
					for (const a of pin.alts) {
						if (a.bus && inUse.has(a.bus) && w.bus !== a.bus) {
							const users = vis.filter((q) => spaceOf(q) === space && q.pins.some((x) => x.bus === a.bus)).map((q) => q.short);
							add('bad', `${nm(w)} uses ${label} (${pin.name}) as a plain GPIO, but it is ${a.fn} and ${a.bus.toUpperCase()} is in use by ${users.join(', ')}.`);
						}
					}
				}
			}
		}
	}

	// Logic levels: a 5 V part fed from a 3.3 V GPIO needs a shifter named in its notes (or a via part that is shown).
	for (const p of vis.filter((q) => q.logic === '5v')) {
		for (const w of wiresOf(p)) {
			const gpio = w.to != null && pinOf(w.space, w.to)?.type === 'gpio';
			if (gpio && (w.dir === 'out' || w.dir === 'bi')) {
				const shifted = /level.?shift|shifter/i.test(`${w.note} ${p.note}`);
				if (w.via) {
					const via = partById(w.via);
					if (!via) add('bad', `${nm(w)} goes through ${w.via}, which is not in the data.`);
					else if (!visible(via)) add('warn', `${nm(w)} needs ${via.short} (a level shifter), which is hidden.`);
				} else if (!shifted) add('bad', `${nm(w)} is a 5 V part driven from a 3.3 V GPIO (pin ${w.to}) with no level shifter.`);
			}
			if (gpio && w.dir === 'in') add('bad', `${nm(w)} puts a 5 V signal on a 3.3 V GPIO (pin ${w.to}).`);
		}
	}

	// Rail loads. A part's current counts against the first supply it is wired to.
	const load = {};
	const rails = [];
	const addLoad = (id, mA, who) => {
		load[id] ??= { mA: 0, who: [] };
		load[id].mA += mA;
		if (mA) load[id].who.push(`${who.short} ${mA}`);
	};
	for (const p of vis) {
		const space = spaceOf(p);
		let src = null;
		for (const w of wiresOf(p)) {
			const t = w.to != null ? pinOf(space, w.to)?.type : null;
			if (t === '5v') src = 'pi5v';
			else if (t === '3v3') src = space === 'pi' ? 'pi3v3' : 'pico3v3';
			else if (t === 'vbus' || t === 'vsys') src = 'picoVbus';
			if (src) break;
		}
		src ??= p.supply ?? (p.board === 'usb' ? 'usb' : null);
		if (src && p.currentMa) addLoad(src, p.currentMa, p);
	}
	// Everything hanging off the Pico comes through its USB lead.
	const usbMa = (load.usb?.mA ?? 0) + (load.pico3v3?.mA ?? 0) + (load.picoVbus?.mA ?? 0);
	const usbWho = [...(load.usb?.who ?? []), ...(load.pico3v3 || load.picoVbus ? [`Pico parts ${(load.pico3v3?.mA ?? 0) + (load.picoVbus?.mA ?? 0)}`] : [])];
	for (const id of ['pi5v', 'pi3v3', 'usb', 'buck', 'pico3v3', 'picoVbus']) {
		const lim = limits[id];
		const mA = id === 'usb' ? usbMa : (load[id]?.mA ?? 0);
		if (!mA && !['pi5v', 'pi3v3', 'usb'].includes(id)) continue;
		const who = id === 'usb' ? usbWho : (load[id]?.who ?? []);
		const level = lim.mA && mA > lim.mA ? 'bad' : lim.mA && mA >= lim.mA * 0.8 ? 'warn' : 'ok';
		rails.push({ id, lim, mA, who, level });
		if (level !== 'ok') add(level, `${lim.label}: ${mA} mA planned against ${lim.mA} mA.`);
	}
	return { msgs, rails, vis };
}

// ---- rendering ----
const W = 600, ROW = 27, TOP = 70, DOTL = 290, DOTR = 350, PORTL = 226, PORTR = 414, BOXW = 130;
const rowY = (r) => TOP + r * ROW;
const posOf = (space, n) => (space === 'pi' ? { row: Math.ceil(n / 2) - 1, side: n % 2 ? 'L' : 'R' } : n <= 20 ? { row: n - 1, side: 'L' } : { row: 40 - n, side: 'R' });

function drawPlan() {
	const space = state.tab;
	const board = boards[space];
	const here = parts.filter((p) => spaceOf(p) === space && visible(p));
	const free = state.free ? usedAny(space) : null;
	const inUse = busesInUse(space, parts.filter(visible));
	const used = new Set(here.flatMap((p) => p.pins.map((w) => w.to).filter(Boolean)));
	const stripParts = tabParts().filter((p) => visible(p) && !p.pins.some((w) => w.to != null));
	const boxParts = here.filter((p) => p.pins.some((w) => w.to != null));
	const stripRows = Math.ceil(stripParts.length / 4);
	const bottom = rowY(19) + 36;
	const H = bottom + (stripRows ? 40 + stripRows * 52 : 14);
	const svg = sv('svg', { class: 'plan' + (state.free ? ' free-on' : ''), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': board.title + ' wiring plan' });

	// Board backdrop and header block
	const bx = DOTL - 30, bw = DOTR - DOTL + 60;
	svg.append(sv('rect', { class: 'boardbg', x: bx, y: TOP - 30, width: bw, height: bottom - TOP + 20, rx: 10 }));
	svg.append(sv('rect', { class: 'hdr', x: DOTL - 15, y: TOP - 14, width: DOTR - DOTL + 30, height: 19 * ROW + 28, rx: 4 }));
	svg.append(sv('text', { x: W / 2, y: 18, 'text-anchor': 'middle', style: 'font-size:13px;font-weight:700' }, board.title));
	svg.append(sv('text', { x: W / 2, y: 33, 'text-anchor': 'middle', class: 'note-txt' }, space === 'pi' ? 'USB ports down · pin 1 top left · board edge on the right' : 'micro-USB up · pin 1 top left'));
	if (space === 'pi') svg.append(sv('text', { x: W / 2, y: bottom + 2, 'text-anchor': 'middle', class: 'note-txt' }, '▼ USB / Ethernet ports'));

	// Box placement: each part sits on the side most of its pins are on, near their mean row.
	const place = { L: [], R: [] };
	for (const p of boxParts) {
		const ws = p.pins.filter((w) => w.to != null).map((w) => ({ w, ...posOf(space, w.to) }));
		const side = ws.filter((x) => x.side === 'L').length >= ws.filter((x) => x.side === 'R').length ? 'L' : 'R';
		const y = rowY(ws.reduce((a, x) => a + x.row, 0) / ws.length);
		place[side].push({ p, y });
	}
	const boxes = new Map();
	for (const side of ['L', 'R']) {
		const list = place[side].sort((a, b) => a.y - b.y);
		let min = TOP - 20;
		for (const b of list) {
			b.y = Math.max(b.y - 17, min);
			min = b.y + 52;
			boxes.set(b.p.id, { side, y: b.y, x: side === 'L' ? 4 : W - 4 - BOXW });
		}
	}

	const wireLayer = sv('g'), pinLayer = sv('g'), boxLayer = sv('g'), tickLayer = sv('g');
	svg.append(wireLayer, pinLayer, boxLayer, tickLayer);
	const sel = state.part, selPin = state.pin;
	const active = (w) => !sel && !selPin ? true : sel ? w.part.id === sel : w.to === selPin && w.space === space;

	// Wires
	for (const p of boxParts) {
		const box = boxes.get(p.id);
		const ws = wiresOf(p).filter((w) => w.to != null);
		ws.forEach((w, k) => {
			const pos = posOf(space, w.to);
			const x0 = box.side === 'L' ? box.x + BOXW : box.x;
			const y0 = box.y + 23 + (k - (ws.length - 1) / 2) * 3.5;
			const x1 = pos.side === 'L' ? PORTL : PORTR;
			const y1 = rowY(pos.row);
			const dx = Math.max(40, Math.abs(x1 - x0) * 0.5) * (x1 > x0 ? 1 : -1);
			const d = `M${x0} ${y0} C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}`;
			const g = sv('g', { class: active(w) ? '' : 'dim' });
			g.append(sv('path', { class: 'wire-halo', d }), sv('path', { class: 'wire' + (w.status === 'proposed' ? ' prop' : ''), d, style: `stroke:${colourVar(w.wire)}` }));
			const hit = sv('path', { class: 'wire-hit', d, onclick: () => pick(p.id) });
			hit.append(sv('title', {}, `${p.short} ${w.partPin} → pin ${w.to} (${w.wire}, ${w.status})`));
			g.append(hit);
			wireLayer.append(g);
			if (ticks.has(w.key)) {
				const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
				tickLayer.append(sv('g', { class: 'tickb' + (active(w) ? '' : ' dim'), transform: `translate(${mx} ${my})` }, sv('circle', { r: 8 }), sv('path', { d: 'M-3.5 0 L-1 3 L4 -3' })));
			}
		});
	}

	// Pins
	for (const pin of board.pins) {
		const pos = posOf(space, pin.n);
		const cx = pos.side === 'L' ? DOTL : DOTR, cy = rowY(pos.row);
		const bus = busOf(space, pin);
		const cls = ['pin', 't-' + pin.type, bus ? 'b-' + bus : '', used.has(pin.n) ? 'used' : '', selPin === pin.n ? 'sel' : ''];
		if (free) {
			const reserved = board.exclusive && pin.alts.some((a) => a.bus && inUse.has(a.bus));
			if (pin.type === 'gpio' && !free.has(pin.n) && !reserved) cls.push('free');
		}
		const g = sv('g', { class: cls.filter(Boolean).join(' '), tabindex: 0, role: 'button', 'aria-label': `Pin ${pin.n} ${pin.name}`, onclick: (e) => { e.stopPropagation(); pickPin(pin.n); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickPin(pin.n); } }, onpointerenter: () => showPin(pin.n), onpointerleave: () => showPin(state.pin) });
		const portX = pos.side === 'L' ? PORTL : PORTR;
		g.append(sv('line', { class: 'pline', x1: portX, y1: cy, x2: cx, y2: cy }));
		const alt = pin.alts[0] && pin.type === 'gpio' && space === 'pi' ? pin.alts[0].fn.split(' ')[0] : '';
		g.append(sv('text', { class: 'lbl', x: pos.side === 'L' ? cx - 14 : cx + 14, y: cy, 'text-anchor': pos.side === 'L' ? 'end' : 'start', 'dominant-baseline': 'central' }, pin.name + (alt && bus ? ` ${alt}` : '')));
		g.append(pin.n === 1 ? sv('rect', { class: 'dot', x: cx - 10, y: cy - 10, width: 20, height: 20, rx: 3 }) : sv('circle', { class: 'dot', cx, cy, r: 10 }));
		g.append(sv('text', { class: 'num', x: cx, y: cy }, pin.n));
		g.append(sv('circle', { cx, cy, r: 13, fill: 'transparent' }));
		pinLayer.append(g);
	}

	// Part boxes beside the header, and a strip below for parts with no header pin.
	const drawBox = (p, x, y) => {
		const n = p.pins.length;
		const g = sv('g', { class: 'pbox' + (sel === p.id ? ' sel' : ''), tabindex: 0, role: 'button', 'aria-label': p.name, onclick: (e) => { e.stopPropagation(); pick(p.id); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p.id); } } });
		g.append(sv('rect', { x, y, width: BOXW, height: 46, rx: 6 }));
		g.append(sv('text', { class: 'n', x: x + 8, y: y + 17 }, p.short));
		g.append(sv('text', { class: 's', x: x + 8, y: y + 31 }, `${p.phase} · ${n} wire${n === 1 ? '' : 's'}`));
		const done = wiresOf(p).filter((w) => ticks.has(w.key)).length;
		g.append(sv('text', { class: 's', x: x + 8, y: y + 42, style: done === n ? 'fill:var(--ok)' : '' }, `${done}/${n} ticked`));
		return g;
	};
	for (const p of boxParts) {
		const b = boxes.get(p.id);
		boxLayer.append(drawBox(p, b.x, b.y));
	}
	if (stripParts.length) {
		const y0 = bottom + 34;
		boxLayer.append(sv('text', { x: 4, y: y0 - 8, class: 'note-txt' }, 'Not on the header: cables, ribbons and the 5 V supply'));
		stripParts.forEach((p, i) => boxLayer.append(drawBox(p, 4 + (i % 4) * 149, y0 + Math.floor(i / 4) * 52)));
	}
	svg.addEventListener('click', () => { state.part = null; state.pin = null; render(); });
	return svg;
}

const wireCell = (w) => h('span', {}, h('span', { class: 'dotc', style: `background:${colourVar(w.wire)}` }), w.wire);
function tickBox(w) {
	return h('input', { type: 'checkbox', checked: ticks.has(w.key), 'aria-label': `Connected: ${w.part.short} ${w.partPin}`, onchange: (e) => { e.target.checked ? ticks.add(w.key) : ticks.delete(w.key); saveTicks(); render(); } });
}
const target = (w) => {
	if (w.to == null) return ['—', '—', w.ext ?? 'off-header'];
	const pin = pinOf(w.space, w.to);
	return [`${w.space === 'pi' ? 'Pi' : 'Pico'} ${w.to}`, pin?.gpio != null ? `${w.space === 'pi' ? 'GPIO' : 'GP'}${pin.gpio}` : pin?.name ?? '?', pin?.name ?? '?'];
};

function partInfo() {
	const p = partById(state.part);
	const box = h('div');
	if (!p) return h('p', { class: 'empty' }, 'Tap a part to see its wiring table and docs link.');
	box.append(h('h2', {}, p.name), h('p', { class: 'nt' }, `${p.phase} · ${p.board} · ${p.logic === '5v' ? '5 V logic' : '3.3 V logic'} · ${p.currentMa} mA `, p.docsUrl ? h('a', { class: 'doc', href: p.docsUrl, target: '_blank', rel: 'noopener' }, 'docs ↗') : '(no docs link)'));
	const rows = wiresOf(p).map((w) => {
		const [pinTxt, gpio] = target(w);
		return h('tr', {}, h('td', {}, w.partPin), h('td', { class: 'n' }, w.to == null ? w.ext : pinTxt), h('td', { class: 'n' }, gpio), h('td', {}, wireCell(w)), h('td', { class: 'st-' + w.status }, w.status), h('td', {}, tickBox(w)));
	});
	box.append(h('div', { class: 'wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Part pin', 'To', 'GPIO', 'Wire', 'Status', '✓'].map((t) => h('th', {}, t)))), h('tbody', {}, rows))));
	box.append(h('h3', {}, 'Notes'), h('ul', { class: 'nt', style: 'margin:0;padding-left:18px' }, wiresOf(p).filter((w) => w.note).map((w) => h('li', {}, h('b', {}, w.partPin + ': '), w.note))));
	if (p.note) box.append(h('p', { class: 'nt' }, p.note));
	return box;
}

function pinInfo(n) {
	const space = state.tab, pin = n != null ? pinOf(space, n) : null;
	if (!pin) return h('p', { class: 'empty' }, 'Hover or tap a pin.');
	const users = parts.flatMap((p) => (spaceOf(p) === space ? wiresOf(p).filter((w) => w.to === n) : []));
	const lab = space === 'pi' ? 'Pi' : 'Pico';
	return h('div', {},
		h('h2', {}, `${lab} pin ${pin.n} · ${pin.name}`),
		h('p', { class: 'nt' }, `${pin.gpio != null ? (space === 'pi' ? 'GPIO ' : 'GP') + pin.gpio + ' · ' : ''}type ${pin.type}`, pin.alts.length ? ` · alt: ${pin.alts.map((a) => a.fn + (a.bus ? ` (${a.bus.toUpperCase()})` : '')).join(', ')}` : ''),
		users.length ? h('p', { class: 'nt' }, 'Used by: ', users.map((w, i) => h('span', {}, i ? '; ' : '', `${w.part.short} ${w.partPin}`, ` (${w.status}${visible(w.part) ? '' : ', hidden'})`))) : h('p', { class: 'nt' }, 'Not used by any part.'));
}

function showPin(n) {
	$('#pininfo').replaceChildren(pinInfo(n));
}

function drawChecks() {
	const { msgs, rails } = runChecks();
	const box = h('div', { class: 'checks' });
	const bad = msgs.filter((m) => m.level === 'bad'), warn = msgs.filter((m) => m.level === 'warn');
	box.append(h('ul', {}, msgs.length ? [...bad, ...warn].map((m) => h('li', { class: m.level }, m.text)) : h('li', { class: 'ok' }, 'All clear: no shared pins, bus clashes, overloaded rails or unshifted 5 V logic in what is shown.')));
	box.append(h('h3', {}, 'Current'));
	for (const r of rails) {
		const pct = r.lim.mA ? Math.min(100, (r.mA / r.lim.mA) * 100) : 0;
		box.append(h('div', { class: 'rail ' + r.level }, h('span', {}, r.lim.label), h('span', { class: 'mono' }, `${r.mA}${r.lim.mA ? ' / ' + r.lim.mA : ''} mA`),
			r.lim.mA ? h('div', { class: 'bar' }, h('i', { style: `width:${pct}%` })) : null,
			h('small', {}, (r.who.length ? r.who.join(', ') + '. ' : 'Nothing drawing from it. '), r.lim.note, ' ', h('a', { class: 'doc', href: r.lim.url, target: '_blank', rel: 'noopener' }, 'source ↗'))));
	}
	return box;
}

function fullTable() {
	const rows = allWires().map((w) => {
		const [pinTxt, gpio, name] = target(w);
		return { w, cells: [w.part.name, w.partPin, pinTxt, gpio, w.to == null ? w.ext : name, w.wire, w.status, ticks.has(w.key) ? '✓' : '', w.note ?? ''] };
	});
	const head = ['Part', 'Part pin', 'Pin', 'GPIO', 'Goes to', 'Wire', 'Status', 'Done', 'Note'];
	const tsv = [head, ...rows.map((r) => r.cells)].map((r) => r.join('\t')).join('\n');
	const table = h('table', {}, h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), h('tbody', {}, rows.map(({ w, cells }) => h('tr', {}, cells.map((c, i) => h('td', { class: i === 2 || i === 3 ? 'n' : i === 6 ? 'st-' + w.status : i === 8 ? 'nt' : '' }, i === 5 ? wireCell(w) : c))))));
	return { table, tsv, count: rows.length };
}

async function copyTable(tsv, btn) {
	try {
		await navigator.clipboard.writeText(tsv);
	} catch {
		const ta = h('textarea', { class: 'sr' });
		ta.value = tsv;
		document.body.append(ta);
		ta.select();
		try { document.execCommand('copy'); } catch {}
		ta.remove();
	}
	btn.textContent = 'Copied';
	setTimeout(() => (btn.textContent = 'Copy table'), 1500);
}

function legend() {
	const items = [['pin-5v', '5 V'], ['pin-3v3', '3.3 V'], ['pin-gnd', 'GND'], ['pin-gpio', 'GPIO']];
	if (state.tab === 'pi') items.push(['bus-i2c1', 'I2C1'], ['bus-spi0', 'SPI0'], ['bus-uart0', 'UART0'], ['bus-spi1', 'SPI1'], ['bus-pcm', 'PCM'], ['pin-id', 'ID EEPROM']);
	else items.push(['bus-adc', 'ADC'], ['pin-id', 'control']);
	return h('ul', { class: 'legend' }, items.map(([v, t]) => h('li', {}, h('i', { class: 'sw', style: `background:var(--${v})` }), t)), h('li', {}, h('i', { class: 'sw solid' }), 'decided'), h('li', {}, h('i', { class: 'sw dash' }), 'proposed'), h('li', {}, h('i', { class: 'sw', style: 'border-radius:3px;background:var(--pin-gpio)' }), 'pin 1'));
}

// ---- actions ----
const pick = (id) => { state.part = state.part === id ? null : id; state.pin = null; render(); };
const pickPin = (n) => { state.pin = state.pin === n ? null : n; state.part = null; render(); };

function render() {
	$('#plan').replaceChildren(drawPlan(), legend());
	$('#partinfo').replaceChildren(partInfo());
	showPin(state.pin);
	$('#checks').replaceChildren(drawChecks());
	$('#checklist').replaceChildren(...tabParts().map((p) => h('label', {}, h('input', { type: 'checkbox', checked: !state.hidden.has(p.id), disabled: !phaseOk(p), onchange: (e) => { e.target.checked ? state.hidden.delete(p.id) : state.hidden.add(p.id); render(); } }), p.short, h('span', { class: 'tag' }, p.phase))));
	const ft = fullTable();
	$('#fulltable').replaceChildren(ft.table);
	$('#copy').onclick = (e) => copyTable(ft.tsv, e.target);
	const total = ft.count, done = allWires().filter((w) => ticks.has(w.key)).length;
	$('#prog').textContent = `${done} of ${total} wires ticked`;
	for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
	for (const b of document.querySelectorAll('[data-phase]')) b.setAttribute('aria-pressed', String(b.dataset.phase === state.phase));
	$('#free').checked = state.free;
}

for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => { state.tab = b.dataset.tab; state.part = null; state.pin = null; render(); };
for (const b of document.querySelectorAll('[data-phase]')) b.onclick = () => { state.phase = b.dataset.phase; render(); };
$('#free').onchange = (e) => { state.free = e.target.checked; render(); };
$('#reset').onclick = () => { if (!ticks.size || confirm('Clear every tick?')) { ticks = new Set(); saveTicks(); render(); } };
render();
