// Client side of the Wiring tab: draws the Pi 5 header, the Pico and the whole-box diagram from the data in wiring.mjs,
// and shows the checks from wiring-checks.mjs. Inlined by build-page.mjs inside an IIFE where WData and WCheck exist.
const { boards, parts, limits, links, piPorts } = WData;
const { runChecks, spaceOf, wiresOf, pinOf, endLabel, linksOf, otherEnd } = WCheck;
const DATA = { boards, parts, limits, links, piPorts };
const root = document.getElementById('wiring');
const $ = (q) => root.querySelector(q);
const NS = 'http://www.w3.org/2000/svg';

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
let db = null; // the shared db when the page runs on claude.ai; ticks live there, localStorage is only the fallback
try { ticks = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch {}
const state = { tab: 'pi', phase: 'v1', hidden: new Set(), free: false, part: null, pin: null };
let tickDoc = null;
function saveTicks() {
	const keys = [...ticks];
	if (db) tickDoc.set({ keys, updated: new Date().toISOString() }).catch(() => {});
	else try { localStorage.setItem(KEY, JSON.stringify(keys)); } catch {}
}

// ---- data helpers ----
const partById = (id) => parts.find((p) => p.id === id);
const phaseOk = (p) => state.phase === 'all' || p.phase === state.phase;
const visible = (p) => phaseOk(p) && !state.hidden.has(p.id);
const colourVar = (w) => `var(--w-${w || 'grey'})`;
const tabParts = () => (state.tab === 'box' ? parts : parts.filter((p) => spaceOf(p) === state.tab && !p.view));
const allWires = () => parts.filter(visible).flatMap(wiresOf);
const busOf = (space, pin) => {
	if (pin.type !== 'gpio') return null;
	if (space === 'pico') return pin.alts.some((a) => a.fn.startsWith('ADC')) ? 'adc' : null;
	return pin.alts.find((a) => a.bus)?.bus ?? null;
};
const usedAny = (space) => new Set(parts.filter((p) => spaceOf(p) === space).flatMap((p) => p.pins.map((w) => w.to).filter(Boolean)));
const busesInUse = (space, list) => new Set(list.filter((p) => spaceOf(p) === space).flatMap((p) => p.pins.map((w) => w.bus).filter(Boolean)));
const keyOf = (partId, partPin) => {
	const p = partById(partId);
	const i = p?.pins.findIndex((w) => w.partPin === partPin);
	return i >= 0 ? `${partId}|${i}` : null;
};
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// 'ribbon → CAM/DISP 1' style lines for a part's pins that are not on a header.
const offLines = (p) =>
	wiresOf(p)
		.filter((w) => w.to == null)
		.map((w) => {
			const l = linksOf(DATA, p, w)[0];
			const far = l ? endLabel(DATA, otherEnd(l, p, w)).replace(/^Pi /, '') : 'not linked';
			return `${w.partPin} → ${far}`;
		});

// ---- Pi and Pico views ----
const W = 640, ROW = 27, TOP = 84, DOTL = 310, DOTR = 370, PORTL = 212, PORTR = 468, BOXW = 150;
const rowY = (r) => TOP + r * ROW;
const posOf = (space, n) => (space === 'pi' ? { row: Math.ceil(n / 2) - 1, side: n % 2 ? 'L' : 'R' } : n <= 20 ? { row: n - 1, side: 'L' } : { row: 40 - n, side: 'R' });

function drawPins() {
	const space = state.tab;
	const board = boards[space];
	const here = parts.filter((p) => spaceOf(p) === space && !p.view && visible(p));
	const free = state.free ? usedAny(space) : null;
	const inUse = busesInUse(space, parts.filter(visible));
	const used = new Set(here.flatMap((p) => p.pins.map((w) => w.to).filter(Boolean)));
	const boxParts = here.filter((p) => p.pins.some((w) => w.to != null));
	const stripParts = tabParts().filter((p) => visible(p) && !p.pins.some((w) => w.to != null));
	const BOXH = (p) => 38 + Math.min(3, offLines(p).length + (offLines(p).length > 2 ? 1 : 0)) * 11 + 11;
	const stripRows = Math.ceil(stripParts.length / 4);
	const bottom = rowY(19) + 36;
	const H = bottom + (stripRows ? 44 + stripRows * 84 : 14);
	const svg = sv('svg', { class: 'plan' + (state.free ? ' free-on' : ''), viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': board.title + ' wiring plan' });

	const bx = DOTL - 30, bw = DOTR - DOTL + 60;
	svg.append(sv('rect', { class: 'boardbg', x: bx, y: TOP - 32, width: bw, height: bottom - TOP + 22, rx: 10 }));
	svg.append(sv('rect', { class: 'hdr', x: DOTL - 15, y: TOP - 14, width: DOTR - DOTL + 30, height: 19 * ROW + 28, rx: 4 }));
	svg.append(sv('text', { x: W / 2, y: 18, 'text-anchor': 'middle', style: 'font-size:13px;font-weight:700' }, board.title));
	svg.append(sv('text', { x: W / 2, y: 33, 'text-anchor': 'middle', class: 'note-txt' }, space === 'pi' ? 'USB ports down · pin 1 top left · board edge on the right' : 'micro-USB up · pin 1 top left'));
	if (space === 'pi') svg.append(sv('text', { x: W / 2, y: bottom + 2, 'text-anchor': 'middle', class: 'note-txt' }, '▼ USB / Ethernet ports'));

	// Boxes sit on the side most of their pins are on, near the mean row of those pins.
	const place = { L: [], R: [] };
	for (const p of boxParts) {
		const ws = p.pins.filter((w) => w.to != null).map((w) => ({ w, ...posOf(space, w.to) }));
		const side = ws.filter((x) => x.side === 'L').length >= ws.filter((x) => x.side === 'R').length ? 'L' : 'R';
		place[side].push({ p, y: rowY(ws.reduce((a, x) => a + x.row, 0) / ws.length) });
	}
	const boxes = new Map();
	for (const side of ['L', 'R']) {
		let min = TOP - 24;
		for (const b of place[side].sort((a, c) => a.y - c.y)) {
			b.y = Math.max(b.y - 20, min);
			min = b.y + BOXH(b.p) + 6;
			boxes.set(b.p.id, { side, y: b.y, x: side === 'L' ? 4 : W - 4 - BOXW });
		}
	}

	const wireLayer = sv('g'), pinLayer = sv('g'), boxLayer = sv('g'), tickLayer = sv('g');
	svg.append(wireLayer, pinLayer, boxLayer, tickLayer);
	const sel = state.part, selPin = state.pin;
	const active = (w) => (!sel && !selPin ? true : sel ? w.part.id === sel : w.to === selPin && w.space === space);

	// Wires. One that goes to the far column crosses the header in the gap beside its row.
	for (const p of boxParts) {
		const box = boxes.get(p.id);
		const ws = wiresOf(p).filter((w) => w.to != null);
		ws.forEach((w, k) => {
			const pos = posOf(space, w.to);
			const x0 = box.side === 'L' ? box.x + BOXW : box.x;
			const y0 = box.y + 20 + (k - (ws.length - 1) / 2) * 3.5;
			const x1 = pos.side === 'L' ? PORTL : PORTR;
			const y1 = rowY(pos.row);
			let d;
			if ((pos.side === 'L') === (box.side === 'L')) {
				const dx = Math.max(40, Math.abs(x1 - x0) * 0.5) * (x1 > x0 ? 1 : -1);
				d = `M${x0} ${y0} C${x0 + dx} ${y0} ${x1 - dx} ${y1} ${x1} ${y1}`;
			} else {
				// Cross the header in the gap beside the target row, then step into the far pin.
				const rh = rowY(1) - rowY(0);
				const yg = y1 + (pos.row === 0 ? rh / 2 : -rh / 2);
				const xn = box.side === 'L' ? PORTL : PORTR;
				const xf = pos.side === 'L' ? DOTL : DOTR;
				const dx = Math.max(40, Math.abs(xn - x0) * 0.5) * (xn > x0 ? 1 : -1);
				d = `M${x0} ${y0} C${x0 + dx} ${y0} ${xn - dx} ${yg} ${xn} ${yg} L${xf} ${yg} L${xf} ${y1}`;
			}
			const g = sv('g', { class: active(w) ? '' : 'dim' });
			g.append(sv('path', { class: 'wire-case', d }), sv('path', { class: 'wire' + (w.status === 'proposed' ? ' prop' : ''), d, style: `stroke:${colourVar(w.wire)}` }));
			const hit = sv('path', { class: 'wire-hit', d, onclick: () => pick(p.id) });
			hit.append(sv('title', {}, `${p.short} ${w.partPin} → pin ${w.to} (${w.wire}, ${w.status})`));
			g.append(hit);
			wireLayer.append(g);
			if (ticks.has(w.key)) tickLayer.append(sv('g', { class: 'tickb' + (active(w) ? '' : ' dim'), transform: `translate(${(x0 + x1) / 2} ${(y0 + y1) / 2})` }, sv('circle', { r: 8 }), sv('path', { d: 'M-3.5 0 L-1 3 L4 -3' })));
		});
	}

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
		g.append(sv('line', { class: 'pline', x1: pos.side === 'L' ? PORTL : PORTR, y1: cy, x2: cx, y2: cy }));
		const alt = pin.alts[0] && pin.type === 'gpio' && space === 'pi' ? pin.alts[0].fn.split(' ')[0] : '';
		g.append(sv('text', { class: 'lbl', x: pos.side === 'L' ? cx - 14 : cx + 14, y: cy, 'text-anchor': pos.side === 'L' ? 'end' : 'start', 'dominant-baseline': 'central' }, pin.name + (alt && bus ? ` ${alt}` : '')));
		g.append(pin.n === 1 ? sv('rect', { class: 'dot', x: cx - 10, y: cy - 10, width: 20, height: 20, rx: 3 }) : sv('circle', { class: 'dot', cx, cy, r: 10 }));
		g.append(sv('text', { class: 'num', x: cx, y: cy }, pin.n));
		g.append(sv('circle', { cx, cy, r: 13, fill: 'transparent' }));
		pinLayer.append(g);
	}

	// A box says what it draws here ("2 on header") and names the rest ("ribbon → CAM/DISP 1").
	const drawBox = (p, x, y) => {
		const hdr = p.pins.filter((w) => w.to != null).length;
		const off = offLines(p);
		const lines = off.slice(0, 2).concat(off.length > 2 ? [`+ ${off.length - 2} more`] : []);
		const done = wiresOf(p).filter((w) => ticks.has(w.key)).length, n = p.pins.length;
		const g = sv('g', { class: 'pbox' + (sel === p.id ? ' sel' : ''), tabindex: 0, role: 'button', 'aria-label': p.name, onclick: (e) => { e.stopPropagation(); pick(p.id); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(p.id); } } });
		g.append(sv('rect', { class: 'bx', x, y, width: BOXW, height: BOXH(p), rx: 6 }));
		g.append(sv('text', { class: 'n', x: x + 8, y: y + 16 }, clip(p.short, 17)));
		g.append(sv('text', { class: 's', x: x + 8, y: y + 29 }, `${p.phase} · ${hdr} on header`));
		lines.forEach((t, i) => g.append(sv('text', { class: 'x', x: x + 8, y: y + 40 + i * 11 }, clip(t, 21))));
		g.append(sv('text', { class: 's', x: x + 8, y: y + BOXH(p) - 6, style: done === n ? 'fill:var(--ok)' : '' }, `${done}/${n} ticked`));
		return g;
	};
	for (const p of boxParts) boxLayer.append(drawBox(p, boxes.get(p.id).x, boxes.get(p.id).y));
	if (stripParts.length) {
		const y0 = bottom + 34;
		boxLayer.append(sv('text', { x: 4, y: y0 - 8, class: 'note-txt' }, 'Not on the header: cables, ribbons and the 5 V supply'));
		stripParts.forEach((p, i) => boxLayer.append(drawBox(p, 4 + (i % 4) * 158, y0 + Math.floor(i / 4) * 84)));
	}
	svg.addEventListener('click', () => { state.part = null; state.pin = null; render(); });
	return svg;
}

// ---- Whole-box view: a block diagram of everything that connects ----
const BW = 156, RH = 13;
const BLOCK = {
	// top left: the face
	buck: [4, 14], face: [4, 98], 'face-shifter': [4, 196],
	// under the board
	'psu-pi': [4, 572], camera: [222, 614], 'lid-screen': [394, 614],
	// right column
	pico: [566, 222], respeaker: [566, 282], 'sound-card': [566, 342], printer: [566, 414], amp: [566, 486], cap: [566, 570], speaker: [566, 642], radiator: [566, 702],
	// 24 V tree
	brick: [4, 700], jack: [4, 770], splitter: [4, 850]
};
const BOARD = { x: 220, y: 350, w: 240, h: 190 };
// Pi connectors: rect for drawing, tip = where a cable attaches, side = which way the cable leaves.
const PORT = {
	header: { rect: [234, 358, 212, 16], anchors: { t: [340, 358], l: [234, 366], b: [330, 374] } },
	fan: { rect: [380, 382, 36, 14], label: 'FAN' },
	usb2a: { rect: [460, 404, 20, 16], tip: [480, 412], side: 'r', label: 'USB 2' },
	usb2b: { rect: [460, 424, 20, 16], tip: [480, 432], side: 'r', label: 'USB 2' },
	usb3a: { rect: [460, 448, 20, 16], tip: [480, 456], side: 'r', label: 'USB 3' },
	usb3b: { rect: [460, 468, 20, 16], tip: [480, 476], side: 'r', label: 'USB 3' },
	eth: { rect: [460, 496, 20, 30], tip: [480, 511], side: 'r', label: 'LAN' },
	usbc: { rect: [236, 540, 30, 12], tip: [251, 552], side: 'b', label: 'USB-C' },
	hdmi0: { rect: [282, 540, 22, 12], tip: [293, 552], side: 'b', label: '' },
	hdmi1: { rect: [310, 540, 22, 12], tip: [321, 552], side: 'b', label: '' },
	cam0: { rect: [362, 540, 28, 12], tip: [376, 552], side: 'b', label: '0', inner: true },
	cam1: { rect: [398, 540, 28, 12], tip: [412, 552], side: 'b', label: '1', inner: true }
};
const OWN_BOX = new Set(['lid-screen', 'face-shifter']);
const KIND = { usb: 'usb', ribbon: 'ribbon', power5: 'power5', power24: 'power24', audio: 'audio', signal: 'signal', bundle: 'signal' };

function drawWhole() {
	const vis = parts.filter(visible);
	const isVis = (id) => vis.some((p) => p.id === id);
	const boxes = new Map(); // id → {x,y,w,h, rows:[pin names], title, lines}
	const mkBox = (id, title, pinsRows, x, y, extra = []) => {
		const rows = pinsRows;
		boxes.set(id, { id, title, rows, extra, x, y, w: BW, h: 26 + Math.max(1, rows.length + extra.length) * 11 + 6 - (rows.length + extra.length ? 0 : 11) });
	};
	for (const p of vis) {
		if (!BLOCK[p.id]) continue;
		mkBox(p.id, p.short, p.pins.map((w) => w.partPin), BLOCK[p.id][0], BLOCK[p.id][1], p.id === 'radiator' ? ['passive, no wires'] : []);
	}
	// Parts on the header, and parts on the Pico, as one bundle each (their detail is on the Pi 5 and Pico tabs).
	const onHeader = vis.filter((p) => spaceOf(p) === 'pi' && !OWN_BOX.has(p.id) && p.pins.some((w) => w.to != null));
	const onPico = vis.filter((p) => spaceOf(p) === 'pico');
	if (onHeader.length) mkBox('hdrbundle', 'Header parts', [], 232, 244, [...onHeader.map((p) => `${p.short} (${p.pins.filter((w) => w.to != null).length})`), 'detail: Pi 5 tab']);
	if (onPico.length) mkBox('picobundle', 'Pico parts', [], 566, 14, [...onPico.map((p) => p.short), 'detail: Pico tab']);
	for (const b of boxes.values()) b.h = 28 + (b.rows.length + b.extra.length || 1) * RH + 4;
	const H = Math.max(...[...boxes.values()].map((b) => b.y + b.h)) + 14;
	const WW = 790;
	const svg = sv('svg', { class: 'plan', viewBox: `0 0 ${WW} ${H}`, role: 'img', 'aria-label': 'Whole box block diagram' });
	svg.append(sv('text', { x: WW / 2, y: 12, 'text-anchor': 'middle', class: 'note-txt' }, 'Cables between parts. Header parts are bundled; their pins are on the Pi 5 and Pico tabs.'));

	// Pi 5 board and its connectors
	svg.append(sv('rect', { class: 'boardbg', x: BOARD.x, y: BOARD.y, width: BOARD.w, height: BOARD.h, rx: 10 }));
	svg.append(sv('text', { x: 232, y: 492, style: 'font-size:13px;font-weight:700' }, 'Raspberry Pi 5'));
	svg.append(sv('text', { x: 232, y: 505, class: 'note-txt' }, 'seen from above; port places'));
	svg.append(sv('text', { x: 232, y: 516, class: 'note-txt' }, 'are from photos'));
	svg.append(sv('text', { class: 'ptxt', x: 307, y: 535, 'text-anchor': 'middle' }, 'micro-HDMI'), sv('text', { class: 'ptxt', x: 394, y: 536, 'text-anchor': 'middle' }, 'CAM/DISP'));
	for (const [id, pt] of Object.entries(PORT)) {
		const [x, y, w, hh] = pt.rect;
		svg.append(sv('rect', { class: 'portbx' + (id === 'header' ? ' hdrblock' : ''), x, y, width: w, height: hh, rx: 2 }));
		if (id === 'header') svg.append(sv('text', { class: 'hdrtxt', x: x + w / 2, y: y + 11, 'text-anchor': 'middle' }, '40-pin header'));
		else if (pt.side === 'r') svg.append(sv('text', { class: 'ptxt', x: x - 4, y: y + hh / 2 + 3, 'text-anchor': 'end' }, pt.label));
		else if (pt.inner) svg.append(sv('text', { class: 'ptxt', x: x + w / 2, y: y + 9, 'text-anchor': 'middle' }, pt.label));
		else if (pt.side === 'b') svg.append(sv('text', { class: 'ptxt', x: x + w / 2, y: y - 5, 'text-anchor': 'middle' }, pt.label));
		else svg.append(sv('text', { class: 'ptxt', x: x + w / 2, y: y + hh / 2 + 3, 'text-anchor': 'middle' }, pt.label));
	}

	// Anchor of one end of a link: a Pi port tip, or a row on a box edge facing the other end.
	const sel = state.part;
	const edgeLayer = sv('g'), boxLayer = sv('g'), tickLayer = sv('g');
	const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
	const hit = (a, b) => { // does the straight run between two boxes cut through a third?
		const [ax, ay] = centre(a), [bx, by] = centre(b);
		for (const o of boxes.values()) {
			if (o === a || o === b) continue;
			for (let t = 0.15; t < 0.9; t += 0.05) {
				const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
				if (x > o.x - 4 && x < o.x + o.w + 4 && y > o.y - 4 && y < o.y + o.h + 4) return true;
			}
		}
		return false;
	};
	const rowY0 = (b, pin) => {
		const i = b.rows.indexOf(pin);
		return b.y + 28 + (i < 0 ? 0 : i) * RH + 5;
	};
	const sideTo = (b, tx, ty, pin, other) => {
		const [cx, cy] = centre(b);
		const dx = tx - cx, dy = ty - cy;
		if (other && hit(b, other) && Math.abs(dx) < b.w) return 'R'; // same column with a box in between: bracket round the right
		if (Math.abs(dx) > Math.abs(dy) * 0.9 || (Math.abs(dx) > b.w && Math.abs(dy) < 90)) return dx > 0 ? 'R' : 'L';
		return dy > 0 ? 'B' : 'T';
	};
	const anchor = (ref, towards, otherBox) => {
		const [id, pin] = ref.split(/:(.*)/s);
		if (id === 'pi') {
			const pt = PORT[pin];
			if (pt.tip) return { x: pt.tip[0], y: pt.tip[1], dir: pt.side };
			return { x: pt.anchors.t[0], y: pt.anchors.t[1], dir: 't' };
		}
		const b = boxes.get(id);
		if (!b) return null;
		const s = sideTo(b, towards[0], towards[1], pin, otherBox);
		const i = Math.max(0, b.rows.indexOf(pin));
		if (s === 'R') return { x: b.x + b.w, y: rowY0(b, pin), dir: 'r' };
		if (s === 'L') return { x: b.x, y: rowY0(b, pin), dir: 'l' };
		const n = Math.max(1, b.rows.length);
		const x = b.x + b.w / 2 + (i - (n - 1) / 2) * 9;
		return s === 'B' ? { x, y: b.y + b.h, dir: 'b' } : { x, y: b.y, dir: 't' };
	};
	const DIRV = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };
	const route = (p0, p1) => {
		const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
		const d = Math.min(dist / 2 + 14, p0.dir === p1.dir ? 60 : 120);
		const [a, b] = [DIRV[p0.dir], DIRV[p1.dir]];
		return `M${p0.x} ${p0.y} C${p0.x + a[0] * d} ${p0.y + a[1] * d} ${p1.x + b[0] * d} ${p1.y + b[1] * d} ${p1.x} ${p1.y}`;
	};
	const touching = (l) => sel && (l.a.startsWith(sel + ':') || l.b.startsWith(sel + ':'));
	const edges = [];
	for (const l of links) {
		const ids = [l.a, l.b].map((r) => r.split(':')[0]).filter((x) => x !== 'pi');
		if (!ids.every((id) => isVis(id) && boxes.has(id))) continue;
		const refPos = (r) => { const [id, pin] = r.split(/:(.*)/s); if (id === 'pi') { const pt = PORT[pin]; return pt.tip ?? pt.anchors.t; } return centre(boxes.get(id)); };
		const ba = boxes.get(l.a.split(':')[0]), bb = boxes.get(l.b.split(':')[0]);
		const p0 = anchor(l.a, refPos(l.b), bb), p1 = anchor(l.b, refPos(l.a), ba);
		if (p0 && p1) edges.push({ d: route(p0, p1), kind: l.kind, status: l.status, mid: [(p0.x + p1.x) / 2, (p0.y + p1.y) / 2], key: keyOf(l.a.split(':')[0], l.a.split(/:(.*)/s)[1]) ?? keyOf(l.b.split(':')[0], l.b.split(/:(.*)/s)[1]), title: `${endLabel(DATA, l.a)} → ${endLabel(DATA, l.b)} (${l.kind}, ${l.status})`, on: touching(l) || !sel, ids: [l.a, l.b] });
	}
	// Header edges, one per part box or bundle that has pins on the header.
	const hdrEdge = (id, towards, kind, status, side) => {
		const b = boxes.get(id);
		if (!b) return;
		const h = PORT.header.anchors;
		const [tx, ty] = towards;
		const to = id === 'lid-screen' ? { x: h.b[0], y: h.b[1], dir: 'b' } : id === 'hdrbundle' ? { x: h.t[0], y: h.t[1], dir: 't' } : { x: h.l[0], y: h.l[1], dir: 'l' };
		const p0 = anchor(`${id}:${b.rows[0] ?? ''}`, [to.x, to.y], null);
		if (p0 && to) edges.push({ d: route(p0, to), kind, status, mid: [(p0.x + to.x) / 2, (p0.y + to.y) / 2], key: null, title: `${b.title} → 40-pin header`, on: !sel || sel === id, ids: [id] });
	};
	if (isVis('lid-screen')) hdrEdge('lid-screen', [0, 0], 'power5', 'proposed');
	if (isVis('face-shifter')) hdrEdge('face-shifter', [0, 0], 'signal', 'decided');
	if (boxes.has('hdrbundle')) hdrEdge('hdrbundle', [0, 0], 'bundle', 'proposed');
	if (boxes.has('picobundle') && boxes.has('pico')) {
		const a = boxes.get('picobundle'), b = boxes.get('pico');
		const p0 = { x: a.x + a.w / 2, y: a.y + a.h, dir: 'b' }, p1 = { x: b.x + b.w / 2, y: b.y, dir: 't' };
		edges.push({ d: route(p0, p1), kind: 'signal', status: 'proposed', mid: [p0.x, (p0.y + p1.y) / 2], key: null, title: 'Pico parts → Pico', on: !sel, ids: [] });
	}
	for (const e of edges) {
		const g = sv('g', { class: e.on ? '' : 'dim' });
		g.append(sv('path', { class: 'wire-case', d: e.d }), sv('path', { class: 'wire' + (e.status === 'proposed' ? ' prop' : ''), d: e.d, style: `stroke:var(--k-${KIND[e.kind]})` }));
		const t = sv('path', { class: 'wire-hit', d: e.d });
		t.append(sv('title', {}, e.title));
		g.append(t);
		edgeLayer.append(g);
		if (e.key && ticks.has(e.key)) tickLayer.append(sv('g', { class: 'tickb' + (e.on ? '' : ' dim'), transform: `translate(${e.mid[0]} ${e.mid[1]})` }, sv('circle', { r: 8 }), sv('path', { d: 'M-3.5 0 L-1 3 L4 -3' })));
	}
	for (const b of boxes.values()) {
		const p = partById(b.id);
		const none = p && !p.pins.length;
		const g = sv('g', { class: 'pbox' + (sel === b.id ? ' sel' : '') + (none ? ' none' : ''), tabindex: p ? 0 : -1, role: p ? 'button' : null, 'aria-label': b.title, onclick: p ? (e) => { e.stopPropagation(); pick(b.id); } : null, onkeydown: p ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(b.id); } } : null });
		g.append(sv('rect', { class: 'bx', x: b.x, y: b.y, width: b.w, height: b.h, rx: 6 }));
		g.append(sv('text', { class: 'n', x: b.x + 8, y: b.y + 18 }, clip(b.title, 19)));
		b.rows.forEach((r, i) => g.append(sv('text', { class: 'x', x: b.x + 8, y: b.y + 28 + i * RH + 9 }, clip(r, 23))));
		b.extra.forEach((r, i) => g.append(sv('text', { class: 'x', x: b.x + 8, y: b.y + 28 + (b.rows.length + i) * RH + 9 }, clip(r, 24))));
		boxLayer.append(g);
	}
	svg.append(edgeLayer, boxLayer, tickLayer);
	svg.addEventListener('click', () => { state.part = null; state.pin = null; render(); });
	return svg;
}

// ---- shared pieces ----
const wireCell = (w) => h('span', {}, h('span', { class: 'dotc', style: `background:${colourVar(w.wire)}` }), w.wire);
function tickBox(w) {
	return h('input', { type: 'checkbox', checked: ticks.has(w.key), 'aria-label': `Connected: ${w.part.short} ${w.partPin}`, onchange: (e) => { e.target.checked ? ticks.add(w.key) : ticks.delete(w.key); saveTicks(); render(); } });
}
const target = (w) => {
	if (w.to == null) {
		const l = linksOf(DATA, w.part, w)[0];
		return { pin: '—', gpio: '—', goes: l ? endLabel(DATA, otherEnd(l, w.part, w)) : 'not linked', name: '' };
	}
	const pin = pinOf(boards, w.space, w.to);
	return { pin: `${w.space === 'pi' ? 'Pi' : 'Pico'} ${w.to}`, gpio: pin?.gpio != null ? `${w.space === 'pi' ? 'GPIO' : 'GP'}${pin.gpio}` : (pin?.name ?? '?'), goes: pin?.name ?? '?', name: pin?.name };
};

function partInfo() {
	const p = partById(state.part);
	if (!p) return h('p', { class: 'empty' }, 'Tap a part to see its wiring table and docs link.');
	const box = h('div');
	box.append(h('h2', {}, p.name), h('p', { class: 'nt' }, `${p.phase} · ${p.logic === '5v' ? '5 V logic' : '3.3 V logic'}${p.currentMa ? ` · ${p.currentMa} mA` : ''} `, p.docsUrl ? h('a', { class: 'doc', href: p.docsUrl, target: '_blank', rel: 'noopener' }, 'docs ↗') : '(no docs link)'));
	if (!p.pins.length) {
		box.append(h('p', { class: 'nt' }, p.note));
		return box;
	}
	const rows = wiresOf(p).map((w) => {
		const t = target(w);
		return h('tr', {}, h('td', {}, w.partPin), h('td', { class: 'n' }, w.to == null ? t.goes : `${t.pin} · ${t.gpio}`), h('td', {}, wireCell(w)), h('td', { class: 'st-' + w.status }, w.status), h('td', {}, tickBox(w)));
	});
	box.append(h('div', { class: 'wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Part pin', 'To', 'Wire', 'Status', '✓'].map((t) => h('th', {}, t)))), h('tbody', {}, rows))));
	box.append(h('h3', {}, 'Notes'), h('ul', { class: 'nt', style: 'margin:0;padding-left:18px' }, wiresOf(p).filter((w) => w.note).map((w) => h('li', {}, h('b', {}, w.partPin + ': '), w.note))));
	if (p.note) box.append(h('p', { class: 'nt' }, p.note));
	return box;
}

function pinInfo(n) {
	const space = state.tab === 'pico' ? 'pico' : 'pi', pin = n != null ? pinOf(boards, space, n) : null;
	if (!pin) return h('p', { class: 'empty' }, state.tab === 'box' ? 'Pin detail is on the Pi 5 and Pico tabs.' : 'Hover or tap a pin.');
	const users = parts.flatMap((p) => (spaceOf(p) === space ? wiresOf(p).filter((w) => w.to === n) : []));
	const lab = space === 'pi' ? 'Pi' : 'Pico';
	return h('div', {},
		h('h2', {}, `${lab} pin ${pin.n} · ${pin.name}`),
		h('p', { class: 'nt' }, `${pin.gpio != null ? (space === 'pi' ? 'GPIO ' : 'GP') + pin.gpio + ' · ' : ''}type ${pin.type}`, pin.alts.length ? ` · alt: ${pin.alts.map((a) => a.fn + (a.bus ? ` (${a.bus.toUpperCase()})` : '')).join(', ')}` : ''),
		users.length ? h('p', { class: 'nt' }, 'Used by: ', users.map((w, i) => h('span', {}, i ? '; ' : '', `${w.part.short} ${w.partPin}`, ` (${w.status}${visible(w.part) ? '' : ', hidden'})`))) : h('p', { class: 'nt' }, 'Not used by any part.'));
}
const showPin = (n) => $('.w-pininfo').replaceChildren(pinInfo(n));

// ---- checks: one compact row each, notes behind "?" ----
function drawChecks() {
	const { clashes, rails } = runChecks(DATA, parts.filter(visible));
	const out = h('div');
	const bad = clashes.filter((m) => m.level === 'bad'), warn = clashes.filter((m) => m.level === 'warn');
	const level = bad.length ? 'bad' : warn.length ? 'warn' : 'ok';
	const word = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
	out.append(h('details', { class: `crow flat ${level}`, open: level !== 'ok' },
		h('summary', {}, h('span', {}, level === 'ok' ? 'No pin clashes' : `${word(bad.length + warn.length, 'problem')} in pins, buses or levels`), h('span', { class: 'st' }, level === 'ok' ? '✓' : '⚠'), h('span', { class: 'q' }, level === 'ok' ? '?' : '+')),
		h('div', { class: 'more' }, level === 'ok' ? 'Checked: two wires on one pin, a bus pin used as plain GPIO while its bus is in use, signals on power or HAT ID pins, 5 V parts on 3.3 V GPIOs without a shifter, and cables that go nowhere.' : h('ul', {}, [...bad, ...warn].map((m) => h('li', {}, m.text))))));
	for (const r of rails) {
		const pct = r.lim.mA ? Math.min(100, (r.mA / r.lim.mA) * 100) : 0;
		out.append(h('details', { class: `crow ${r.level}` },
			h('summary', {}, h('span', {}, r.lim.label), h('span', { class: 'bar' }, r.lim.mA ? h('i', { style: `width:${pct}%` }) : null), h('span', { class: 'val' }, `${r.mA}${r.lim.mA ? ' / ' + r.lim.mA : ''} mA`), h('span', { class: 'st' }, r.level === 'ok' ? '✓' : '⚠'), h('span', { class: 'q' }, '?')),
			h('div', { class: 'more' }, (r.who.length ? r.who.join(', ') + '. ' : 'Nothing drawing from it. '), r.lim.note, ' ', h('a', { class: 'doc', href: r.lim.url, target: '_blank', rel: 'noopener' }, 'source ↗'))));
	}
	return out;
}

function fullTable() {
	const rows = allWires().map((w) => {
		const t = target(w);
		return { w, cells: [w.part.name, w.partPin, t.pin, t.gpio, t.goes, w.wire, w.status, ticks.has(w.key) ? '✓' : '', w.note ?? ''] };
	});
	const head = ['Part', 'Part pin', 'Pin', 'GPIO', 'Goes to', 'Wire', 'Status', 'Done', 'Note'];
	const tsv = [head, ...rows.map((r) => r.cells)].map((r) => r.join('\t')).join('\n');
	const table = h('table', {}, h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))), h('tbody', {}, rows.map(({ w, cells }) => h('tr', {}, cells.map((c, i) => h('td', { class: i === 2 || i === 3 ? 'n' : i === 6 ? 'st-' + w.status : i === 8 ? 'nt' : '' }, i === 5 ? wireCell(w) : c))))));
	return { table, tsv, count: rows.length };
}

async function copyTable(tsv, btn) {
	try { await navigator.clipboard.writeText(tsv); } catch {
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
	if (state.tab === 'box') {
		const k = [['usb', 'USB'], ['ribbon', 'ribbon'], ['power5', '5 V'], ['power24', '24 V'], ['audio', 'audio'], ['signal', 'signal']];
		return h('ul', { class: 'wlegend' }, k.map(([v, t]) => h('li', {}, h('i', { class: 'sw solid', style: `border-top-color:var(--k-${v})` }), t)), h('li', {}, h('i', { class: 'sw solid' }), 'decided'), h('li', {}, h('i', { class: 'sw dash' }), 'proposed'));
	}
	const items = [['pin-5v', '5 V'], ['pin-3v3', '3.3 V'], ['pin-gnd', 'GND'], ['pin-gpio', 'GPIO']];
	if (state.tab === 'pi') items.push(['bus-i2c1', 'I2C1'], ['bus-spi0', 'SPI0'], ['bus-uart0', 'UART0'], ['bus-spi1', 'SPI1'], ['bus-pcm', 'PCM'], ['pin-id', 'ID EEPROM']);
	else items.push(['bus-adc', 'ADC'], ['pin-id', 'control']);
	return h('ul', { class: 'wlegend' }, items.map(([v, t]) => h('li', {}, h('i', { class: 'sw', style: `background:var(--${v})` }), t)), h('li', {}, h('i', { class: 'sw solid' }), 'decided'), h('li', {}, h('i', { class: 'sw dash' }), 'proposed'), h('li', {}, h('i', { class: 'sw', style: 'border-radius:3px;background:var(--pin-gpio)' }), 'pin 1'));
}

// ---- actions ----
const pick = (id) => { state.part = state.part === id ? null : id; state.pin = null; render(); };
const pickPin = (n) => { state.pin = state.pin === n ? null : n; state.part = null; render(); };

function render() {
	$('.w-plan').replaceChildren(state.tab === 'box' ? drawWhole() : drawPins(), legend());
	$('.w-partinfo').replaceChildren(partInfo());
	showPin(state.pin);
	$('.w-checks').replaceChildren(drawChecks());
	$('.w-checklist').replaceChildren(...tabParts().map((p) => h('label', {}, h('input', { type: 'checkbox', checked: !state.hidden.has(p.id), disabled: !phaseOk(p), onchange: (e) => { e.target.checked ? state.hidden.delete(p.id) : state.hidden.add(p.id); render(); } }), p.short, h('span', { class: 'tag' }, p.phase))));
	const ft = fullTable();
	$('.w-fulltable').replaceChildren(ft.table);
	$('.w-copy').onclick = (e) => copyTable(ft.tsv, e.target);
	const done = allWires().filter((w) => ticks.has(w.key)).length;
	$('.w-prog').textContent = `${done} of ${ft.count} wires ticked`;
	for (const b of root.querySelectorAll('[data-wtab]')) b.setAttribute('aria-pressed', String(b.dataset.wtab === state.tab));
	for (const b of root.querySelectorAll('[data-wphase]')) b.setAttribute('aria-pressed', String(b.dataset.wphase === state.phase));
	$('.w-free').checked = state.free;
	$('.w-free-wrap').hidden = state.tab === 'box';
	$('.wlayout').classList.toggle('wide', state.tab === 'box');
	$('.w-plan').classList.toggle('scroll', state.tab === 'box');
}

for (const b of root.querySelectorAll('[data-wtab]')) b.onclick = () => { state.tab = b.dataset.wtab; state.part = null; state.pin = null; render(); };
for (const b of root.querySelectorAll('[data-wphase]')) b.onclick = () => { state.phase = b.dataset.wphase; render(); };
$('.w-free').onchange = (e) => { state.free = e.target.checked; render(); };
$('.w-reset').onclick = () => { if (!ticks.size || confirm('Clear every tick?')) { ticks = new Set(); saveTicks(); render(); } };
render();

// Ticks save to the page's shared db (doc wiring/ticks), so ones made on the phone show on the laptop.
// Outside claude.ai (a local file) there is no db and localStorage keeps them in this browser.
(async () => {
	db = window.claude?.use ? await window.claude.use('db') : null;
	if (!db) return;
	tickDoc = db.collection('wiring').doc('ticks');
	tickDoc.onSnapshot((d) => {
		if (!d.exists) return;
		const keys = d.data().keys;
		if (Array.isArray(keys)) { ticks = new Set(keys); render(); }
	}, () => {});
})();
