// The steampunk wall board: the October wall plate (wall.mjs) without the printer, with exposed parts.
// renderBoard(layout) -> { svg, callouts }. Strings only. A layout is just positions, so trying one is cheap.
import { kernel, frame, svgOpen, callout, dim } from './common.mjs';

const STAND = 20; // gap behind the board for a cleat and cables
const THICK = 12;
export const gapOf = (layout) => layout.gap ?? STAND;
export const CLEARANCE = 3; // pocket gap around a part, mm
export const FRONT_ORIGIN = 105;
export const RELIEF = 0.1;

// Sizes in mm. `source` says how far to trust each one. Change a size here and every layout follows.
export const SPECS = {
	eink: { du: 174, dz: 123, out: 12, name: 'E-ink, 7.3"', does: 'The calm main screen: clock and a bit of information. Pimoroni rates the current 7.3" at 28 s per change, so it suits slow things: a quote every 15–30 minutes or the day ahead.', source: 'Pimoroni Inky, current edition, 174 × 123; older Inky and Waveshare mono are about 170 × 111, so check which you buy', sure: 'published' },
	lcd: { du: 121, dz: 80, out: 16, name: '5" DSI touch LCD, 800 × 480', does: 'The touch screen, for immediate things such as the next bus, a timer or print. 5 to 7 inches, not decided.', source: 'Retailer listing, 121 × 80 × 10: check Waveshare\'s drawing', sure: 'approx' },
	lcd7: { du: 189, dz: 120, out: 16, name: '7" DSI touch LCD', does: 'Matches the e-ink in size. Tidy, but takes about 40 cm of width beside it.', source: 'Raspberry Pi Touch Display 2 outline, 189 × 120 per a CNX Software listing. Depth is a guess', sure: 'approx' },
	lcdround: { r: 60, out: 16, name: '4" round DSI touch LCD', does: 'Reads as a gauge in a brass ring. Best for one live thing at a time.', source: 'Waveshare 4" DSI LCD (C), 720 × 720. Ring of Ø 120 and depth are guesses: Waveshare\'s drawing is unchecked', sure: 'guess' },
	pi: { du: 85, dz: 56, out: 26, plug: 25, plugDown: 25, name: 'Pi 5 with Active Cooler', does: 'Runs chota. Its fan needs open air, and plugs need room to bend.', source: '85 × 56 board; 8 mm standoffs + 1.6 board + 16 USB stack. Plug room of 25 mm is a guess', sure: 'approx depth' },
	pico: { du: 51, dz: 21, out: 11, name: 'Pico 2 WH', does: 'Reads the knob, button and toggles, and drives the meter.', source: 'Wall plate brief, 51 × 21; 6 mm standoffs + 1.6 board + USB socket', sure: 'published' },
	display: { du: 56, dz: 35, out: 17, name: 'Pico Display Pack 2.0"', does: 'The one small screen on the board, with 4 buttons, on Wi-Fi or USB. A second one can live elsewhere in the house. Needs a 5 V lead either way.', source: 'Pimoroni, 56 × 35 × 11, plus 6 mm standoffs', sure: 'published' },
	oled: { du: 61, dz: 40, out: 12, name: '2.42" OLED', does: 'Instant response when someone presses something.', source: 'Not checked: drawn about 61 × 40', sure: 'guess' },
	thin: { r: 15, out: 6, name: 'Thin backup speaker, 28 mm', does: 'Backup for chimes when the main speakers are off. Main sound comes from separate speakers.', source: 'Core Electronics thin speaker: 28 mm, just over 4 mm deep. The 30 mm brass ring is a guess', sure: 'approx' },
	meter: { r: 28, out: 10, name: 'Needle meter', does: 'Shows one number at a glance.', source: 'Illustrative: no size in the parts list', sure: 'illustrative' },
	knob: { r: 19, out: 16, name: 'Knob', does: 'Turns through screens or sets a level.', source: 'Wall plate brief, wooden knob', sure: 'illustrative' },
	print: { r: 20, out: 12, name: 'PRINT button', does: 'Prints on demand.', source: 'On hand, 30 mm, with a 40 mm brass collar', sure: 'published' },
	toggle: { r: 5, out: 18, name: '3 mini toggles', does: 'Three small switches for modes.', source: 'On hand; bats sticking out about 18 mm is a guess', sure: 'guess' },
	lamp: { r: 8, out: 10, name: 'Indicator lamp', does: 'Shows a state at a glance.', source: 'Illustrative: 16 mm brass bezel with a domed lens', sure: 'illustrative' },
	switch: { r: 9, out: 30, name: 'Big toggle switch', does: 'One big switch. At 30 mm it sticks out further than anything else.', source: 'Illustrative: 18 mm nut, 12 mm collar, long bat', sure: 'illustrative' }
};

// u from the board's left edge, z up from its bottom edge. Boxes give their lower-left corner; round parts their centre.
export const LAYOUTS = [
	{"id":"cabinet","title":"Cabinet (try first)","note":"Two columns: the Pi over the LCD, the e-ink beside them, hands below.","w":360,"h":340,"t":12,"wires":[["lcd","pi","ffc"],["eink","pi","ffc"],["thin","pi"],["display0","pi"],["pico","pi"],["meter","pico"],["knob","pico"],["print","pico"],["toggle","pico"],["lamp0","pico"]],"items":[{"id":"eink","kind":"eink","u":172,"z":192,"sink":0},{"id":"pi","kind":"pi","u":56,"z":276,"sink":0},{"id":"lcd","kind":"lcd","u":36,"z":164,"sink":0},{"id":"thin","kind":"thin","u":62,"z":100,"sink":0},{"id":"meter","kind":"meter","u":178,"z":125,"sink":0},{"id":"display0","kind":"display","u":284,"z":142,"sink":0},{"id":"toggle","kind":"toggle","u":146,"z":62,"sink":0},{"id":"knob","kind":"knob","u":240,"z":72,"sink":0},{"id":"print","kind":"print","u":305,"z":72,"sink":0},{"id":"pico","kind":"pico","u":160,"z":24,"sink":0},{"id":"lamp0","kind":"lamp","u":30,"z":290,"sink":0}]},
	{"id":"cascade","title":"Cascade","note":"A diagonal of screens, big and slow at top left down to small and instant at bottom right.","w":480,"h":340,"t":12,"wires":[["lcd","pi","ffc"],["eink","pi","ffc"],["thin","pi"],["display0","pi"],["pico","pi"],["meter","pico"],["knob","pico"],["print","pico"],["toggle","pico"],["lamp0","pico"],["lamp1","pico"]],"items":[{"id":"eink","kind":"eink","u":26,"z":200,"sink":0},{"id":"pi","kind":"pi","u":216,"z":262,"sink":0},{"id":"lcd","kind":"lcd","u":208,"z":130,"sink":0},{"id":"display0","kind":"display","u":402,"z":26,"sink":0},{"id":"thin","kind":"thin","u":410,"z":270,"sink":0},{"id":"meter","kind":"meter","u":66,"z":135,"sink":0},{"id":"pico","kind":"pico","u":122,"z":140,"sink":0},{"id":"toggle","kind":"toggle","u":40,"z":62,"sink":0},{"id":"knob","kind":"knob","u":150,"z":74,"sink":0},{"id":"print","kind":"print","u":280,"z":62,"sink":0},{"id":"lamp0","kind":"lamp","u":345,"z":180,"sink":0},{"id":"lamp1","kind":"lamp","u":365,"z":150,"sink":0}]},
	{"id":"orrery","title":"Orrery","note":"The Pi at the centre between the two screens, with the round instruments on one arc around it.","w":480,"h":320,"t":12,"wires":[["lcd","pi","ffc"],["eink","pi","ffc"],["thin","pi"],["display0","pi"],["pico","pi"],["meter","pico"],["knob","pico"],["print","pico"],["toggle","pico"],["lamp0","pico"],["lamp1","pico"],["lamp2","pico"]],"items":[{"id":"eink","kind":"eink","u":24,"z":175,"sink":0},{"id":"pi","kind":"pi","u":208,"z":215,"sink":0},{"id":"lcd","kind":"lcd","u":340,"z":205,"sink":0},{"id":"thin","kind":"thin","u":82,"z":125,"sink":0},{"id":"lamp0","kind":"lamp","u":148,"z":66,"sink":0},{"id":"knob","kind":"knob","u":197,"z":45,"sink":0},{"id":"print","kind":"print","u":250,"z":38,"sink":0},{"id":"lamp1","kind":"lamp","u":313,"z":48,"sink":0},{"id":"lamp2","kind":"lamp","u":376,"z":81,"sink":0},{"id":"meter","kind":"meter","u":427,"z":140,"sink":0},{"id":"display0","kind":"display","u":296,"z":130,"sink":0},{"id":"toggle","kind":"toggle","u":146,"z":150,"sink":0},{"id":"pico","kind":"pico","u":160,"z":95,"sink":0}]},
	{
		id: 'panel',
		title: 'A. Instrument panel',
		note: 'Tidy rows, wide board. The calmest, and the easiest to keep level and dust.',
		w: 440,
		h: 300,
		parts: {
			eink: [24, 155],
			lcd: [222, 190],
			thin: [390, 232],
			pi: [28, 40],
			pico: [28, 112],
			display: [[135, 90], [135, 40]],
			oled: [216, 118],
			meter: [330, 140],
			toggle: [222, 75],
			knob: [335, 70],
			print: [395, 70]
		},
		wires: [['lcd', 'pi', 'ffc'], ['eink', 'pi', 'ffc'], ['display0', 'pi'], ['display1', 'pi'], ['thin', 'pi'], ['oled', 'pico'], ['meter', 'pico']]
	},
	{
		id: 'workshop',
		title: 'B. Workshop',
		note: 'Off-centre, with the Pi up high like a boiler and the wiring on show. The most steampunk, and the hardest to get right.',
		w: 480,
		h: 320,
		parts: {
			eink: [282, 178],
			lcd: [150, 192],
			thin: [66, 84],
			pi: [28, 228],
			pico: [28, 180],
			display: [[136, 128], [206, 128]],
			oled: [288, 118],
			meter: [412, 130],
			toggle: [206, 72],
			knob: [150, 70],
			print: [330, 66]
		},
		wires: [['lcd', 'pi', 'ffc'], ['eink', 'pi', 'ffc'], ['display0', 'pi'], ['display1', 'pi'], ['thin', 'pi'], ['oled', 'pico'], ['meter', 'pico'], ['knob', 'pico'], ['print', 'pico']]
	},
	{
		id: 'tall',
		title: 'C. Tall',
		note: 'Narrow board for a tight wall, read top to bottom: calm, then quick, then hands.',
		w: 270,
		h: 470,
		parts: {
			eink: [48, 330],
			lcd: [74, 232],
			display: [[28, 170], [186, 170]],
			meter: [135, 187],
			pi: [28, 88],
			oled: [122, 100],
			thin: [226, 118],
			pico: [28, 50],
			toggle: [100, 58],
			knob: [185, 48],
			print: [234, 44]
		},
		wires: [['lcd', 'pi', 'ffc'], ['eink', 'pi', 'ffc'], ['display0', 'pi'], ['display1', 'pi'], ['thin', 'pi'], ['oled', 'pico'], ['meter', 'pico']]
	}
];

// Every placed part: { id, kind, u, z, sink }. Sink is how far it drops into the board.
export function itemsOf(layout) {
	if (layout.items) return layout.items;
	const out = [];
	for (const [kind, at] of Object.entries(layout.parts)) {
		const list = kind === 'display' ? at : [at];
		list.forEach((p, i) => out.push({ id: kind === 'display' ? `display${i}` : kind, kind, u: p[0], z: p[1], sink: 0 }));
	}
	return out;
}

// A part's outline on the board. Toggles are a row of three, 28 mm apart.
export function boundsOf(it) {
	const sp = SPECS[it.kind];
	if (it.kind === 'toggle') return { u0: it.u - 5, z0: it.z - 5, u1: it.u + 61, z1: it.z + 5 };
	if (sp.r !== undefined) return { u0: it.u - sp.r, z0: it.z - sp.r, u1: it.u + sp.r, z1: it.z + sp.r };
	return { u0: it.u, z0: it.z, u1: it.u + sp.du, z1: it.z + sp.dz };
}

// The hole to cut: the outline plus clearance, plus room for plugs where the part has them.
export function pocketOf(it) {
	const b = boundsOf(it);
	const sp = SPECS[it.kind];
	return { u0: b.u0 - CLEARANCE, z0: b.z0 - CLEARANCE - (sp.plugDown ?? 0), u1: b.u1 + CLEARANCE + (sp.plug ?? 0), z1: b.z1 + CLEARANCE };
}

// Where plugs need room even on a flat board: USB and Ethernet to the right, power and HDMI below.
export function plugZonesOf(it) {
	const sp = SPECS[it.kind];
	if (!sp.plug) return [];
	return [
		{ u0: it.u + sp.du, z0: it.z + 4, u1: it.u + sp.du + sp.plug, z1: it.z + 52 },
		{ u0: it.u, z0: it.z - sp.plugDown, u1: it.u + 52, z1: it.z }
	];
}

const r2 = (n) => +n.toFixed(2);
const rad = (d) => (d * Math.PI) / 180;

function hull(pts) {
	const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const half = (list) => {
		const out = [];
		for (const q of list) {
			while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
			out.push(q);
		}
		return out.slice(0, -1);
	};
	return half(p).concat(half([...p].reverse()));
}

// A straight-on view through the same drawing code: depth only nudges parts down and right a little.
function frontKernel(OX, OY, S, BW) {
	const f = (n) => +n.toFixed(2);
	const D = (x, y, z) => [(-y + RELIEF * x) * S, (-z + RELIEF * x) * S];
	const P = (x, y, z) => [f((BW - y + RELIEF * x) * S + OX), f((-z + RELIEF * x) * S + OY)];
	const plane = (O, U, V) => {
		const o = P(...O), u = D(...U), v = D(...V);
		return `matrix(${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${o[0]} ${o[1]})`;
	};
	const rect = (t, w, h, r = 0, cls = 'face') => `<g transform="${t}"><rect class="${cls}" width="${f(w)}" height="${f(h)}" rx="${r}"/></g>`;
	return { P, D, plane, rect, f };
}

export function renderBoard(layout, view = 'iso', selected = null) {
	const { w: BW, h: BH } = layout;
	const T = layout.t ?? THICK;
	const GAP = gapOf(layout);
	const FACE0 = GAP + T;
	let FACE = FACE0; // draw functions read this, so a sunk part just draws lower
	const front = view === 'front';
	const SC = 1.2;
	const DP = 240;
	const probeK = kernel(0, 0, SC);
	const probeF = frame(probeK, BW, DP);
	const corners = [[-20, 0, -20], [BW + 20, 0, -20], [-20, 0, BH + 20], [BW + 20, 0, BH + 20], [0, FACE + 45, 0], [BW, FACE + 45, 0]].map((p) => probeF.Pt(...p));
	const xs = corners.map((p) => p[0]);
	const ys = corners.map((p) => p[1]);
	const LANE = 330; // room for the labels either side
	const K = front ? frontKernel(FRONT_ORIGIN, BH + 50, 1, BW) : kernel(LANE - Math.min(...xs), 50 - Math.min(...ys), SC);
	const F = frame(K, BW, DP);
	const { Pt, BTOP, PLANE_AT_W, PLANE_AT_U } = F;
	const vbW = front ? BW + 165 : Math.max(...xs) - Math.min(...xs) + 2 * LANE;
	const vbH = front ? BH + 120 : Math.max(...ys) - Math.min(...ys) + 110;

	const g = (t, inner) => `<g transform="${t}">${inner}</g>`;
	const wb = (u, w, z, du, dw, h, cls) =>
		K.rect(PLANE_AT_U(u, w, z + h), dw, h, 0, `face ${cls} s`) +
		K.rect(BTOP(u, w, z + h), du, dw, 0, `face ${cls} t`) +
		K.rect(PLANE_AT_W(u, w + dw, z + h), du, h, 0, `face ${cls} f`);
	const cylW = (u, z, r, w0, w1, side, front, extra = '') => {
		const ring = (w) => Array.from({ length: 32 }, (_, i) => Pt(u + r * Math.cos((i / 32) * 2 * Math.PI), w, z + r * Math.sin((i / 32) * 2 * Math.PI)));
		const pts = hull([...ring(w0), ...ring(w1)]).map((p) => p.map(r2).join(',')).join(' ');
		return `<polygon class="face ${side}" points="${pts}"/>` + g(PLANE_AT_W(u - r, w1, z + r), `<circle class="face ${front}" cx="${r}" cy="${r}" r="${r}"/>${extra}`);
	};
	const standoff = (u, z, w1, r = 2.4) => cylW(u, z, r, FACE, w1, 'brass s', 'brass t');
	const screw = (u, z, w, r = 2.4) => cylW(u, z, r, w, w + 1.2, 'brass s', 'brass t', `<line class="detail" x1="${r * 0.4}" y1="${r}" x2="${r * 1.6}" y2="${r}"/>`);
	const fourHoles = (u, z, du, dz, inset) => [[u + inset, z + inset], [u + du - inset, z + inset], [u + inset, z + dz - inset], [u + du - inset, z + dz - inset]];

	const draw = {
		eink: (u, z) => {
			const { du, dz } = SPECS.eink;
			const w0 = FACE + 8;
			let s = fourHoles(u, z, du, dz, 4).map(([a, b]) => standoff(a, b, w0)).join('');
			s += wb(u, w0, z, du, 2, dz, 'dark');
			const lines = [0, 1, 2].map((i) => `<rect class="face dark t" x="20" y="${72 + i * 11}" width="${[126, 134, 88][i]}" height="2.2" stroke-width="0"/>`).join('');
			s += g(PLANE_AT_W(u + 3, w0 + 2, z + dz - 3), `<rect class="paper" width="${du - 6}" height="${dz - 6}"/><text class="face dark t" x="20" y="50" font-size="38" font-weight="600" stroke-width="0">18:42</text>${lines}<text class="face dark t" x="20" y="108" font-size="7" stroke-width="0">placeholder text</text>`);
			return s + fourHoles(u, z, du, dz, 4).map(([a, b]) => screw(a, b, w0 + 2, 1.8)).join('');
		},
		lcdround: (u, z) => {
			const { r } = SPECS.lcdround;
			const face = `<circle class="screen-on" cx="${r}" cy="${r}" r="${r - 10}"/><text class="screen-text" x="${r}" y="${r + 5}" text-anchor="middle" font-size="16" font-weight="600">Bus 7 min</text>`;
			return cylW(u, z, r, FACE, FACE + 16, 'brass s', 'brass t', face);
		},
		lcd7: (u, z) => draw.lcd(u, z, SPECS.lcd7),
		lcd: (u, z, { du, dz } = SPECS.lcd) => {
			const w0 = FACE + 8;
			let s = fourHoles(u, z, du, dz, 4).map(([a, b]) => standoff(a, b, w0)).join('');
			s += wb(u, w0, z, du, 1.6, dz, 'pcb') + wb(u + 3, w0 + 1.6, z + 3, du - 6, 5, dz - 6, 'dark');
			s += g(PLANE_AT_W(u + 3, w0 + 6.6, z + dz - 3), `<rect class="glass" width="${du - 6}" height="${dz - 6}"/><rect class="screen-on" x="3" y="3" width="${du - 12}" height="${dz - 12}" rx="1"/><text class="screen-text" x="10" y="30" font-size="17" font-weight="600">Bus 7 min</text><rect class="screen-ink" x="10" y="42" width="64" height="2.4"/><rect class="screen-ink" x="10" y="50" width="42" height="2.4" opacity="0.6"/>`);
			return s;
		},
		pi: (u, z) => {
			const w1 = FACE + 8;
			const f = w1 + 1.6;
			let s = fourHoles(u, z, 85, 56, 3.5).map(([a, b]) => standoff(a, b, w1, 2.6)).join('');
			s += wb(u, w1, z, 85, 1.6, 56, 'pcb');
			s += wb(u + 67, f, z + 34, 18, 13.5, 16, 'plain') + wb(u + 67, f, z + 20, 18, 16, 13, 'plain') + wb(u + 67, f, z + 6, 18, 16, 13, 'plain');
			s += wb(u + 7, f, z + 49, 51, 8.5, 5.5, 'dark');
			s += wb(u + 8, f, z + 7, 56, 10, 40, 'plain');
			let fins = '';
			for (let x = 3; x < 56; x += 3) fins += `M${x} 0V40`;
			s += g(PLANE_AT_W(u + 8, f + 10, z + 47), `<path class="hair" d="${fins}"/>`);
			let bl = `<circle class="detail" cx="15" cy="15" r="12.5"/><circle class="face plain t" cx="15" cy="15" r="3.5"/>`;
			for (let i = 0; i < 7; i++) {
				const a = rad(i * (360 / 7));
				bl += `<path class="detail" d="M15 15Q${r2(15 + 8 * Math.cos(a + 0.5))} ${r2(15 + 8 * Math.sin(a + 0.5))} ${r2(15 + 12.5 * Math.cos(a + 1.1))} ${r2(15 + 12.5 * Math.sin(a + 1.1))}"/>`;
			}
			return s + cylW(u + 36, z + 27, 15, f + 10, f + 13, 'dark s', 'dark f', bl);
		},
		pico: (u, z) => {
			const w1 = FACE + 6;
			const f = w1 + 1.6;
			let s = fourHoles(u, z, 51, 21, 2).map(([a, b]) => standoff(a, b, w1, 1.5)).join('');
			s += wb(u, w1, z, 51, 1.6, 21, 'pcb') + wb(u - 3, f, z + 6, 8, 3, 8, 'plain') + wb(u + 18, f, z + 6, 8, 1, 8, 'dark') + wb(u + 32, f, z + 5, 14, 1.2, 11, 'plain');
			let pins = '';
			for (let i = 0; i < 20; i++) pins += `<circle class="face brass t" cx="${r2(2 + i * 2.48)}" cy="0" r="0.75"/><circle class="face brass t" cx="${r2(2 + i * 2.48)}" cy="18" r="0.75"/>`;
			return s + g(PLANE_AT_W(u, f, z + 19.5), pins);
		},
		display: (u, z) => {
			const w1 = FACE + 6;
			const f = w1 + 1.6;
			let s = fourHoles(u, z, 56, 35, 2.5).map(([a, b]) => standoff(a, b, w1, 1.6)).join('');
			s += wb(u, w1, z, 56, 1.6, 35, 'dark') + wb(u + 7.6, f, z + 2.2, 40.8, 3.4, 30.6, 'dark');
			s += g(PLANE_AT_W(u + 7.6, f + 3.4, z + 32.8), `<rect class="glass" width="40.8" height="30.6"/><rect class="screen-on" x="1" y="1" width="38.8" height="28.6"/><text class="screen-text" x="4" y="14" font-size="9" font-weight="600">4.2 c</text><rect class="screen-ink" x="4" y="20" width="26" height="1.6"/>`);
			let b = '';
			[8, 27].forEach((y) => { b += `<circle class="face plain t" cx="3.8" cy="${y}" r="1.7"/><circle class="face plain t" cx="52.2" cy="${y}" r="1.7"/>`; });
			return s + g(PLANE_AT_W(u, f, z + 35), b);
		},
		oled: (u, z) => {
			const { du, dz } = SPECS.oled;
			const w1 = FACE + 7;
			let s = fourHoles(u, z, du, dz, 2.5).map(([a, b]) => standoff(a, b, w1, 1.6)).join('');
			s += wb(u, w1, z, du, 1.6, dz, 'pcb');
			return s + g(PLANE_AT_W(u + 4, w1 + 1.6, z + dz - 5), `<rect class="glass" width="${du - 8}" height="${dz - 12}"/><text class="screen-text" x="4" y="17" font-size="10">printing...</text>`);
		},
		thin: (cu, cz) => cylW(cu, cz, 15, FACE, FACE + 5, 'brass s', 'brass f') + cylW(cu, cz, 12.5, FACE + 5, FACE + 6, 'dark s', 'dark t'),
		meter: (cu, cz) => {
			const { r } = SPECS.meter;
			let dial = `<circle class="paper" cx="${r}" cy="${r}" r="${r - 4}"/>`;
			for (let i = 0; i < 9; i++) {
				const a = rad(-60 + i * 15);
				dial += `<line class="detail" x1="${r2(r + 15 * Math.sin(a))}" y1="${r2(r + 6 - 15 * Math.cos(a))}" x2="${r2(r + 19 * Math.sin(a))}" y2="${r2(r + 6 - 19 * Math.cos(a))}" stroke-width="1"/>`;
			}
			dial += `<line class="accent" x1="${r}" y1="${r + 6}" x2="${r + 9}" y2="${r - 10}" stroke-width="1.4"/><circle class="face dark t" cx="${r}" cy="${r + 6}" r="2.2"/>`;
			return cylW(cu, cz, r, FACE, FACE + 8, 'brass s', 'brass f', dial);
		},
		knob: (cu, cz) => cylW(cu, cz, 19, FACE, FACE + 2, 'brass s', 'brass f') + cylW(cu, cz, 15, FACE + 2, FACE + 16, 'wood s', 'wood t', `<circle class="detail" cx="15" cy="15" r="11"/><line class="cable" x1="15" y1="15" x2="23" y2="7" stroke-width="2.4"/>`),
		print: (cu, cz) => cylW(cu, cz, 20, FACE, FACE + 4, 'brass s', 'brass f', `<circle class="detail" cx="20" cy="20" r="16.5"/>`) + cylW(cu, cz, 15, FACE + 4, FACE + 10, 'accent', 'accent', `<ellipse class="accent-hi" cx="11" cy="9" rx="6" ry="4" opacity="0.8"/>`),
		toggle: (u, z) => [0, 28, 56].map((d) => cylW(u + d, z, 5, FACE, FACE + 2, 'brass s', 'brass t') + wb(u + d - 1.5, FACE + 2, z - 1.5, 3, 16, 3, 'brass')).join(''),
		lamp: (cu, cz) => cylW(cu, cz, 8, FACE, FACE + 3, 'brass s', 'brass f') + cylW(cu, cz, 6, FACE + 3, FACE + 10, 'accent', 'accent'),
		switch: (cu, cz) => cylW(cu, cz, 9, FACE, FACE + 2, 'brass s', 'brass t') + cylW(cu, cz, 6, FACE + 2, FACE + 4, 'plain s', 'plain t') + wb(cu - 2, FACE + 4, cz - 2, 4, 26, 4, 'brass')
	};

	// Placed parts, keeping a centre for wires and labels.
	const placed = itemsOf(layout).filter((it) => !it.hidden).map((it) => {
		const box = boundsOf(it);
		return { ...it, p: [it.u, it.z], cu: (box.u0 + box.u1) / 2, cz: (box.z0 + box.z1) / 2, sp: SPECS[it.kind], sink: it.sink ?? 0 };
	});
	const byId = Object.fromEntries(placed.map((q) => [q.id, q]));

	// Plate, then wires on its face (they pass behind boards), then parts right-and-low first.
	let s = svgOpen(`0 0 ${r2(vbW)} ${r2(vbH)}`, `${layout.title}: wooden wall board ${BW} by ${BH} mm with exposed parts`);
	s += K.rect(PLANE_AT_W(-20, 0, BH + 20), BW + 40, BH + 40, 0, 'face plain t');
	s += g(PLANE_AT_W(16, 0, BH - 10), `<rect class="face dark s" width="${BW}" height="${BH - 10}" opacity="0.2" stroke-width="0"/>`);
	s += K.rect(PLANE_AT_U(0, GAP, BH), T, BH, 0, 'face wood s');
	s += g(PLANE_AT_U(0, GAP, BH), `<path class="hair" d="M6 0V${BH}M12 0V${BH}"/>`);
	s += K.rect(BTOP(0, GAP, BH), BW, T, 0, 'face wood t');
	s += K.rect(PLANE_AT_W(0, FACE, BH), BW, BH, 0, 'face wood f');
	let grain = '';
	for (let y = 20; y < BH; y += 22) grain += `M${6 + (y % 3) * 3} ${y}H${BW - 6 - (y % 5) * 4}`;
	s += g(PLANE_AT_W(0, FACE, BH), `<path class="hair" d="${grain}" opacity="0.45"/>`);
	const PITCH = 25;
	if (layout.grid) {
		let dots = '';
		let lines = '';
		for (let x = PITCH; x < BW; x += PITCH) lines += `M${x} 0V${BH}`;
		for (let y = PITCH; y < BH; y += PITCH) lines += `M0 ${y}H${BW}`;
		for (let x = PITCH; x < BW; x += PITCH) for (let y = PITCH; y < BH; y += PITCH) dots += `<circle class="face dark t" cx="${x}" cy="${y}" r="2.5" stroke-width="0"/>`;
		s += g(PLANE_AT_W(0, FACE, BH), layout.grid === 'holes' ? dots : `<path class="hair" d="${lines}"/>`);
	}
	fourHoles(0, 0, BW, BH, 12).forEach(([u, z]) => (s += screw(u, z, FACE, 3)));

	for (const [from, to, cls] of layout.wires ?? []) {
		const a = byId[from];
		const b = byId[to];
		if (!a || !b) continue;
		const pa = Pt(a.cu, FACE + 1, a.cz);
		const pb = Pt(b.cu, FACE + 1, b.cz);
		const c = Pt(a.cu, FACE + 1, b.cz);
		s += `<path class="${cls ?? 'cable'}" d="M${pa[0]} ${pa[1]}Q${c[0]} ${c[1]} ${pb[0]} ${pb[1]}"${cls ? '' : ' stroke-width="1.6"'}/>`;
	}

	[...placed].sort((a, b) => b.cu - b.cz - (a.cu - a.cz)).forEach((q) => {
		if (!q.sink) {
			s += draw[q.kind](q.p[0], q.p[1]);
			return;
		}
		// The rim hides whatever sits below the face, so clip to the hole swept out toward the viewer.
		const b = pocketOf(q);
		const du = b.u1 - b.u0;
		const dz = b.z1 - b.z0;
		const floor = FACE0 - q.sink;
		const sweep = [FACE0, FACE0 + 120].flatMap((w) => [[b.u0, b.z0], [b.u1, b.z0], [b.u0, b.z1], [b.u1, b.z1]].map(([u, z]) => Pt(u, w, z)));
		const id = `bp-${view}-${layout.id ?? 'x'}-${q.id}`;
		s += `<clipPath id="${id}"><polygon points="${hull(sweep).map((p) => p.map(r2).join(',')).join(' ')}"/></clipPath><g clip-path="url(#${id})">`;
		s += K.rect(PLANE_AT_W(b.u0, floor, b.z1), du, dz, 0, 'face dark s');
		s += K.rect(PLANE_AT_U(b.u1, floor, b.z1), q.sink, dz, 0, 'face wood s');
		s += K.rect(BTOP(b.u0, floor, b.z0), du, q.sink, 0, 'face wood t');
		FACE = floor;
		s += draw[q.kind](q.p[0], q.p[1]);
		FACE = FACE0;
		s += '</g>';
		s += g(PLANE_AT_W(b.u0, FACE0, b.z1), `<rect class="detail" width="${du}" height="${dz}" fill="none"/>`);
	});
	if (selected && byId[selected]) {
		const b = boundsOf(byId[selected]);
		s += g(PLANE_AT_W(b.u0 - 2, FACE0, b.z1 + 2), `<rect class="accent" width="${b.u1 - b.u0 + 4}" height="${b.z1 - b.z0 + 4}" fill="none" stroke-width="2.5" stroke-dasharray="6 4" style="fill:none;stroke:var(--accent)"/>`);
	}

	s += dim(Pt(0, FACE, -14), Pt(BW, FACE, -14), `${BW} mm`, [18, 22]);
	s += dim(Pt(-14, FACE, 0), Pt(-14, FACE, BH), `${BH} mm`, [-34, 8], 'end');

	if (front) return { svg: s + '</svg>', callouts: [], vbW };

	// Labels in two lanes, sorted by height so leaders don't tangle. One label per kind of part.
	const seen = new Set();
	const tips = placed.filter((q) => !seen.has(q.kind) && seen.add(q.kind)).map((q) => ({ q, tip: Pt(q.cu, FACE0 + q.sp.out - q.sink, q.cz) }));
	tips.sort((a, b) => a.tip[0] - b.tip[0]);
	const half = Math.ceil(tips.length / 2);
	const callouts = [];
	let n = 0;
	const lane = (list, x, side) => {
		list.sort((a, b) => a.tip[1] - b.tip[1]);
		const step = Math.min(74, (vbH - 90) / Math.max(list.length, 1));
		list.forEach((t, i) => {
			n += 1;
			const fact = `sticks out ${t.q.sp.out - t.q.sink} mm`;
			s += callout(n, t.tip, [x, 60 + i * step], t.q.sp.name.length > 30 ? t.q.sp.name.slice(0, 30) : t.q.sp.name, fact, side);
			callouts.push({ n, name: t.q.sp.name, fact });
		});
	};
	lane(tips.slice(0, half), LANE - 24, 'l');
	lane(tips.slice(half), vbW - LANE + 24, 'r');
	return { svg: s + '</svg>', callouts, vbW };
}
