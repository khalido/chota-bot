// Drawing 2 (v2): the wall plate. A pure runtime module: renderWall(state) -> { svg, callouts }.
// state = { cover: boolean, printerLid: 0..1 }. Strings only, no Node APIs.
import { kernel, frame, svgOpen, callout, dim } from './common.mjs';

// ---------- sizes in mm (KO: change the printer here once measured) ----------
export const PRINTER = { u: 470, z: 150, width: 140, depth: 180, height: 125 }; // Newegg listing: 180 L x 140 W x 125 H, not measured
const PLATE = { w: 640, h: 360, t: 18, stand: 30 };
const FACE = 30 + 18; // plate face, mm off the wall
const SCREEN = { u: 110, z: 165, w: 235, h: 161, lift: 12 }; // Waveshare 10.1" DSI (C), unverified
const MAX_LID_DEG = 95;

const SC = 0.88,
	W = PLATE.w,
	DP = 220;
const rad = (d) => (d * Math.PI) / 180;
const r2 = (n) => +n.toFixed(2);

// ---------- projection, fitted so the figure fills the viewBox ----------
const WALL = { u0: -30, u1: 700, z0: -62, z1: 385 };
const PW1 = FACE + PRINTER.height; // printer face, mm off the wall
const probe = (() => {
	const F0 = frame(kernel(0, 0, SC), W, DP);
	const pts = [
		[WALL.u0, 0, WALL.z1],
		[WALL.u1, 0, WALL.z1],
		[WALL.u0, 0, WALL.z0],
		[WALL.u1, 0, WALL.z0],
		[PRINTER.u + PRINTER.width, PW1 + 8, 60],
		[PRINTER.u, PW1 + 8, 60],
		[690, PW1, 350],
		[-30, FACE, 360]
	];
	const xs = pts.map((p) => F0.Pt(...p)[0]),
		ys = pts.map((p) => F0.Pt(...p)[1]);
	return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
})();
const K = kernel(610 - probe.x, 478 - probe.y, SC);
const F = frame(K, W, DP);
const { Pt, BTOP, PLANE_AT_W, PLANE_AT_U } = F;

// ---------- helpers ----------
const g = (t, inner) => `<g transform="${t}">${inner}</g>`;
const poly = (pts, cls, extra = '') =>
	`<polygon class="${cls}" points="${pts.map((p) => p.map(r2).join(',')).join(' ')}" ${extra}/>`;
const P3 = (p) => Pt(p[0], p[1], p[2]);
function path3(pts, cls, extra = '') {
	const s = pts.map(P3);
	let d = `M${s[0][0]} ${s[0][1]}`;
	for (let i = 1; i < s.length - 1; i++) {
		const m = [(s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2].map(r2);
		d += ` Q${s[i][0]} ${s[i][1]} ${m[0]} ${m[1]}`;
	}
	d += ` L${s[s.length - 1][0]} ${s[s.length - 1][1]}`;
	return `<path class="${cls}" d="${d}" ${extra}/>`;
}
function hull(pts) {
	const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lo = [],
		up = [];
	for (const q of p) {
		while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
		lo.push(q);
	}
	for (const q of [...p].reverse()) {
		while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
		up.push(q);
	}
	return lo.slice(0, -1).concat(up.slice(0, -1));
}
// A box on the plate face. left = u-min edge, top = z-max edge, front = the face toward the viewer.
const wb = (u, w, z, du, dw, h, cls, o = {}) =>
	K.rect(PLANE_AT_U(u, w, z + h), dw, h, 0, `face ${cls} ${o.left ?? 's'}`) +
	K.rect(BTOP(u, w, z + h), du, dw, 0, `face ${cls} ${o.top ?? 't'}`) +
	K.rect(PLANE_AT_W(u, w + dw, z + h), du, h, 0, `face ${cls} ${o.front ?? 'f'}`);
// A cylinder with its axis along w (standing off the plate): hull of two end circles, then the front disc.
function cylW(u, z, r, w0, w1, side, front, extra = '', sideAttr = '') {
	const N = 28,
		ring = (w) =>
			Array.from({ length: N }, (_, i) => {
				const a = (i / N) * 2 * Math.PI;
				return Pt(u + r * Math.cos(a), w, z + r * Math.sin(a));
			});
	return (
		poly(hull([...ring(w0), ...ring(w1)]), `face ${side}`, sideAttr) +
		g(
			PLANE_AT_W(u - r, w1, z + r),
			`<circle class="face ${front}" cx="${r}" cy="${r}" r="${r}"/>${extra}`
		)
	);
}
const hexHint = (r) => {
	const pts = Array.from(
		{ length: 6 },
		(_, i) =>
			`${r2(r + r * 0.62 * Math.cos(rad(60 * i)))},${r2(r + r * 0.62 * Math.sin(rad(60 * i)))}`
	).join(' ');
	return `<polygon class="detail" points="${pts}"/>`;
};
const standoff = (u, z, w0, w1, r = 2.5) => cylW(u, z, r, w0, w1, 'brass s', 'brass t', hexHint(r));
const screwW = (u, z, w, r = 2.6) =>
	cylW(
		u,
		z,
		r,
		w,
		w + 1.4,
		'brass s',
		'brass t',
		`<line class="detail" x1="${r * 0.4}" y1="${r}" x2="${r * 1.6}" y2="${r}"/>`
	);
const hole = (u, z, r = 3.5) =>
	g(PLANE_AT_W(u - r, FACE, z + r), `<circle class="vent" cx="${r}" cy="${r}" r="${r}"/>`);
const pinsW = (u, z, w, n, pitch = 2.54, r = 0.7) => {
	let s = '';
	for (let i = 0; i < n; i++)
		s += `<circle class="face brass t" cx="${r2(i * pitch)}" cy="0" r="${r}"/>`;
	return g(PLANE_AT_W(u, w, z), s);
};

// ---------- static layers (built once) ----------
const DEFS = `<defs>
<pattern id="w-mesh" width="4" height="6.93" patternUnits="userSpaceOnUse"><circle class="detail" cx="2" cy="1.73" r="0.8"/><circle class="detail" cx="0" cy="5.2" r="0.8"/><circle class="detail" cx="4" cy="5.2" r="0.8"/></pattern>
<clipPath id="w-cav"><polygon points="${[
	[474, PW1, 326],
	[606, PW1, 326],
	[606, PW1, 156],
	[474, PW1, 156]
]
	.map((p) => P3(p).join(','))
	.join(' ')}"/></clipPath>
</defs>`;

// wall, drop shadow in the cleat gap, power cord (runs behind the plate), plate, screws, speakers
function backLayer() {
	let s = '';
	const wl = WALL.z1 - WALL.z0;
	s += K.rect(PLANE_AT_W(WALL.u0, 0, WALL.z1), WALL.u1 - WALL.u0, wl, 0, 'face plain t');
	s += g(
		PLANE_AT_W(WALL.u0, 0, WALL.z1),
		`<path class="hair" d="M0 ${WALL.z1 + 50}H${WALL.u1 - WALL.u0}M0 ${WALL.z1 + 58}H${WALL.u1 - WALL.u0}"/>`
	);
	// shadow of the hung plate on the wall: shows as a gap along the left and top edges
	s += g(
		PLANE_AT_W(20, 0, 330),
		`<rect class="face dark s" width="640" height="350" opacity="0.2" stroke-width="0"/>`
	);
	// mains cord: leaves the bottom edge near u = 600 and runs off the wall to the right
	s += path3(
		[
			[600, 40, 12],
			[600, 40, -10],
			[603, 28, -30],
			[614, 14, -52],
			[640, 6, -56],
			[690, 6, -58],
			[704, 6, -58]
		],
		'cable',
		'stroke-width="3"'
	);
	// plate: left edge, top edge, face
	s += K.rect(PLANE_AT_U(0, PLATE.stand, PLATE.h), PLATE.t, PLATE.h, 0, 'face wood s');
	s += g(PLANE_AT_U(0, PLATE.stand, PLATE.h), `<path class="hair" d="M6 0V360M12 0V360"/>`);
	s += K.rect(BTOP(0, PLATE.stand, PLATE.h), PLATE.w, PLATE.t, 0, 'face wood t');
	s += g(BTOP(0, PLATE.stand, PLATE.h), `<path class="hair" d="M0 6H640M0 12H640"/>`);
	s += K.rect(PLANE_AT_W(0, FACE, PLATE.h), PLATE.w, PLATE.h, 0, 'face wood f');
	let grain = '';
	for (let y = 20; y < 360; y += 22) grain += `M${6 + (y % 3) * 3} ${y}H${634 - (y % 5) * 4}`;
	s += g(PLANE_AT_W(0, FACE, PLATE.h), `<path class="hair" d="${grain}" opacity="0.45"/>`);
	[
		[14, 14],
		[626, 14],
		[14, 346],
		[626, 346]
	].forEach(([u, z]) => (s += screwW(u, z, FACE)));
	return s;
}

function speaker(cu, cz) {
	let s = g(
		PLANE_AT_W(cu - 46, FACE, cz + 46),
		`<rect class="ghost" width="92" height="92" rx="3"/>`
	); // sealed back-box behind the plate
	s += cylW(cu, cz, 48, FACE, FACE + 3, 'brass s', 'brass f');
	let d = `<circle class="detail" cx="48" cy="48" r="45"/><circle class="mesh" cx="48" cy="48" r="43"/><circle cx="48" cy="48" r="43" fill="url(#w-mesh)"/><circle class="detail" cx="48" cy="48" r="43"/>`;
	d += `<circle class="face brass t" cx="48" cy="48" r="8"/><circle class="detail" cx="48" cy="48" r="4"/>`;
	[45, 135, 225, 315].forEach(
		(a) =>
			(d += `<circle class="face brass t" cx="${r2(48 + 46.5 * Math.cos(rad(a)))}" cy="${r2(48 + 46.5 * Math.sin(rad(a)))}" r="1.1"/>`)
	);
	s += g(PLANE_AT_W(cu - 48, FACE + 3, cz + 48), d);
	return s;
}

function screenLayer() {
	const { u, z, w, h, lift } = SCREEN;
	const w0 = FACE + lift,
		wg = w0 + 6; // PCB back, glass
	let s = g(
		PLANE_AT_W(u - 12, FACE + 0.2, z + h + 12),
		`<rect class="halo" width="${w + 24}" height="${h + 24}" rx="16" opacity="0.7"/>`
	);
	[
		[u + 3, z + 3],
		[u + w - 3, z + 3],
		[u + 3, z + h - 3],
		[u + w - 3, z + h - 3]
	].forEach(([a, b]) => (s += standoff(a, b, FACE, w0, 2.6)));
	s += wb(u, w0, z, w, 1.6, h, 'pcb');
	s += wb(u + 2, w0 + 1.6, z + 2, w - 2, wg - w0 - 1.6, h - 2, 'dark');
	const sw = w - 2,
		sh = h - 2;
	let d = `<rect class="glass" width="${sw}" height="${sh}"/><rect class="screen-on" x="3" y="3" width="${sw - 6}" height="${sh - 6}" rx="1"/>`;
	d += `<text class="screen-text" x="22" y="86" font-size="62" font-weight="600" letter-spacing="1">06:52</text>`;
	d += `<text class="screen-text" x="24" y="114" font-size="11" opacity="0.9">"She watched the hour fold</text>`;
	d += `<text class="screen-text" x="24" y="129" font-size="11" opacity="0.9">itself into the late light."</text>`;
	d += `<text class="screen-text" x="24" y="147" font-size="8.5" opacity="0.6">- a quiet minute</text>`;
	d += `<rect class="screen-ink" x="150" y="18" width="66" height="2.5" opacity="0.5"/><rect class="screen-ink" x="170" y="25" width="46" height="2.5" opacity="0.35"/>`;
	s += g(PLANE_AT_W(u + 2, wg, z + h), d);
	return s;
}

// ---------- the boards row ----------
const PI = { u: 120, z: 60 },
	PIW = 56,
	PIF = PIW + 1.6;
const MIC = { u: 255, z: 90, r: 35 },
	MICW = 56,
	MICF = MICW + 1.6;
const AMP = { u: 310, z: 70 },
	AMPW = 54,
	AMPF = AMPW + 1.6;
const PICO = { u: 395, z: 125 },
	PICOW = 54,
	PICOF = PICOW + 1.6;

function picoLayer() {
	let s = '';
	[
		[398, 128],
		[443, 128],
		[398, 143],
		[443, 143]
	].forEach(([u, z]) => (s += standoff(u, z, FACE, PICOW, 1.6)));
	s += wb(PICO.u, PICOW, PICO.z, 51, 1.6, 21, 'pcb');
	s += wb(397, PICOF, 143.4, 48, 2.5, 2.5, 'dark') + wb(397, PICOF, 125.6, 48, 2.5, 2.5, 'dark');
	s += pinsW(397.5, 144.65, PICOF + 2.5, 20) + pinsW(397.5, 126.85, PICOF + 2.5, 20);
	s += wb(392, PICOF, 131, 8, 5.5, 8, 'plain'); // micro-USB
	s += wb(412, PICOF, 131, 8, 1, 8, 'dark'); // RP2350
	s += wb(425, PICOF, 131, 14, 1.2, 11, 'plain'); // wifi shield
	s += g(
		PLANE_AT_W(PICO.u, PICOF, PICO.z + 21),
		`<circle class="face plain t" cx="14" cy="14" r="2.2"/>`
	);
	[
		[398, 128],
		[443, 128],
		[398, 143],
		[443, 143]
	].forEach(([u, z]) => (s += screwW(u, z, PICOF, 1.5)));
	return s;
}

function controlsLayer() {
	let s = '';
	// printed scale and labels on the plate face
	let t = '';
	[395, 440].forEach((cu) => {
		for (let i = 0; i < 7; i++) {
			const a = rad(-135 + i * 45),
				r0 = 19.5,
				r1 = i % 3 === 0 ? 26 : 23.5,
				cx = cu - 369,
				cy = 124 - 95; // origin (369, 124)
			t += `<line class="detail" x1="${r2(cx + r0 * Math.sin(a))}" y1="${r2(cy - r0 * Math.cos(a))}" x2="${r2(cx + r1 * Math.sin(a))}" y2="${r2(cy - r1 * Math.cos(a))}" stroke-width="1.2"/>`;
		}
	});
	t += `<text class="face-text" x="${395 - 369}" y="${124 - 119}" font-size="8" text-anchor="middle">WHO</text><text class="face-text" x="${440 - 369}" y="${124 - 119}" font-size="8" text-anchor="middle">WHAT</text>`;
	t += `<text class="face-text" x="${396 - 369}" y="${124 - 43}" font-size="8" text-anchor="end">PRINT</text>`;
	s += g(PLANE_AT_W(369, FACE, 124), t);
	const knob = (cu, ang) => {
		const a = rad(ang);
		const top = `<circle class="detail" cx="15" cy="15" r="11"/><line class="cable" x1="15" y1="15" x2="${r2(15 + 12 * Math.sin(a))}" y2="${r2(15 - 12 * Math.cos(a))}" stroke-width="2.6"/>`;
		return (
			cylW(cu, 95, 17, FACE, FACE + 2, 'brass s', 'brass f') +
			cylW(cu, 95, 15, FACE + 2, FACE + 16, 'wood s', 'wood t', top)
		);
	};
	s += knob(395, -45) + knob(440, 45);
	s += cylW(
		420,
		45,
		20,
		FACE,
		FACE + 4,
		'brass s',
		'brass f',
		`<circle class="detail" cx="20" cy="20" r="16.5"/>`
	);
	s += cylW(
		420,
		45,
		15,
		FACE + 4,
		FACE + 12,
		'accent',
		'accent',
		`<ellipse class="accent-hi" cx="11" cy="9" rx="6" ry="4" opacity="0.8"/>`,
		'opacity="0.8"'
	);
	return s;
}

function ampLayer() {
	let s = '';
	[
		[313, 73],
		[347, 73],
		[313, 97],
		[347, 97]
	].forEach(([u, z]) => (s += standoff(u, z, FACE, AMPW, 1.8)));
	s += wb(AMP.u, AMPW, AMP.z, 40, 1.6, 30, 'pcb');
	s += wb(321, AMPF, 80, 14, 3, 8, 'dark'); // class-D chip
	s += wb(318, AMPF, 94, 10, 8, 6, 'plain') + wb(331, AMPF, 94, 10, 8, 6, 'plain'); // output terminals (R at the top)
	s += wb(321, AMPF, 71, 10, 7, 5, 'plain'); // output terminal (L at the bottom)
	s += wb(306, AMPF, 80, 6, 6, 6, 'dark'); // input jack
	s +=
		cylW(341, 83, 4, AMPF, AMPF + 5, 'dark s', 'dark f') +
		cylW(341, 74, 3, AMPF, AMPF + 4, 'dark s', 'dark f');
	[
		[313, 73],
		[347, 73],
		[313, 97],
		[347, 97]
	].forEach(([u, z]) => (s += screwW(u, z, AMPF, 1.4)));
	return s;
}

function micLayer() {
	let s = '';
	const { u: cu, z: cz, r } = MIC;
	const hs = [45, 135, 225, 315].map((a) => [
		cu + 27 * Math.cos(rad(a)),
		cz + 27 * Math.sin(rad(a))
	]);
	hs.forEach(([a, b]) => (s += standoff(a, b, FACE, MICW, 2.3)));
	s += cylW(cu, cz, r, MICW, MICF, 'pcb s', 'pcb f');
	let t = `<circle class="detail" cx="35" cy="35" r="32"/><circle class="face dark t" cx="35" cy="35" r="7"/><circle class="detail" cx="35" cy="35" r="3.5"/>`;
	[45, 135, 225, 315].forEach(
		(a) =>
			(t += `<circle class="vent" cx="${r2(35 + 17 * Math.cos(rad(a)))}" cy="${r2(35 + 17 * Math.sin(rad(a)))}" r="2.3"/>`)
	);
	for (let i = 0; i < 12; i++) {
		const a = rad(i * 30),
			on = [1, 2, 3].includes(i);
		t += `<circle class="led ${on ? 'on' : ''}" cx="${r2(35 + 27.5 * Math.cos(a))}" cy="${r2(35 + 27.5 * Math.sin(a))}" r="2"/>`;
	}
	s += g(PLANE_AT_W(cu - r, MICF, cz + r), t);
	hs.forEach(([a, b]) => (s += screwW(a, b, MICF, 1.6)));
	s += wb(249, MICF, 52, 12, 3.2, 8, 'plain'); // USB-C at the bottom edge
	s += wb(286, MICF, 84, 8, 5, 6, 'dark'); // line-out jack on the right
	return s;
}

function piLayer() {
	let s = '';
	const holes = [
		[123.5, 63.5],
		[181.5, 63.5],
		[123.5, 112.5],
		[181.5, 112.5]
	];
	holes.forEach(([u, z]) => (s += standoff(u, z, FACE, PIW, 2.6)));
	s += wb(PI.u, PIW, PI.z, 85, 1.6, 56, 'pcb');
	s += g(
		PLANE_AT_W(PI.u + 1.5, PIF, PI.z + 54.5),
		`<rect class="detail" width="82" height="53" rx="3" opacity="0.6"/>`
	);
	// right short edge: ethernet and two USB stacks
	s +=
		wb(187, PIF, 94, 18, 13.5, 16, 'plain') +
		wb(187, PIF, 80, 18, 16, 13, 'plain') +
		wb(187, PIF, 66, 18, 16, 13, 'plain');
	s += g(
		PLANE_AT_W(187, PIF + 13.5, 110),
		`<rect class="detail" x="2" y="2" width="14" height="12"/>`
	);
	s +=
		g(PLANE_AT_W(187, PIF + 16, 93), `<path class="detail" d="M2 2H16M2 11H16"/>`) +
		g(PLANE_AT_W(187, PIF + 16, 79), `<path class="detail" d="M2 2H16M2 11H16"/>`);
	s += wb(117, PIF, 78, 13, 3.4, 9, 'plain'); // USB-C power, left end
	s += wb(180, PIF, 110, 14, 3, 6, 'dark'); // DISP socket
	s += wb(142, PIF, 114.5 - 0, 0.01, 0.01, 0.01, 'dark');
	// Active Cooler
	s += wb(130, PIF, 67, 56, 10, 40, 'plain');
	{
		let fins = '';
		for (let x = 3; x < 56; x += 3) fins += `M${x} 0V40`;
		s += g(PLANE_AT_W(130, PIF + 10, 107), `<path class="hair" d="${fins}"/>`);
		let bl = `<circle class="detail" cx="15" cy="15" r="12.5"/><circle class="face plain t" cx="15" cy="15" r="3.5"/>`;
		for (let i = 0; i < 7; i++) {
			const a = rad(i * (360 / 7));
			bl += `<path class="detail" d="M15 15Q${r2(15 + 8 * Math.cos(a + 0.5))} ${r2(15 + 8 * Math.sin(a + 0.5))} ${r2(15 + 12.5 * Math.cos(a + 1.1))} ${r2(15 + 12.5 * Math.sin(a + 1.1))}"/>`;
		}
		s += cylW(158, 87, 15, PIF + 10, PIF + 13, 'dark s', 'dark f', bl);
	}
	// 40-pin header along the top long edge
	s += wb(127, PIF, 109, 51, 8.5, 5.5, 'dark');
	s += pinsW(128.6, 111, PIF + 8.5, 20) + pinsW(128.6, 113.5, PIF + 8.5, 20);
	holes.forEach(([u, z]) => (s += screwW(u, z, PIF, 2)));
	return s;
}

function cablesLayer() {
	let s = '';
	// adapter board between the screen and the Pi's DISP socket, and the two ribbon legs
	s +=
		wb(174, 58, 127, 26, 1.6, 12, 'pcb') +
		wb(178, 59.6, 133, 18, 2.4, 4, 'dark') +
		wb(178, 59.6, 128, 18, 2.4, 4, 'dark');
	s += path3(
		[
			[187, 61.5, 165.5],
			[187, 63, 153],
			[187, 62, 138]
		],
		'ffc'
	);
	s += path3(
		[
			[187, 61, 128],
			[187, 63, 122],
			[187, 60.5, 116.5]
		],
		'ffc'
	);
	// USB: Pi -> mic board
	s += wb(205, 60, 83, 10, 10, 8, 'dark') + wb(249, 58, 44, 12, 6, 8, 'dark');
	s += path3(
		[
			[215, 65, 87],
			[214, 66, 72],
			[218, 66, 54],
			[232, 64, 42],
			[255, 62, 40],
			[255, 61, 44]
		],
		'cable'
	);
	// line out: mic board -> amp
	s += wb(294, 58, 84, 8, 7, 6, 'dark');
	s += path3(
		[
			[302, 63, 87],
			[305, 66, 90],
			[308, 62, 88],
			[309, 58, 84]
		],
		'cable'
	);
	// amp -> right speaker (up through a hole in the plate)
	s += path3(
		[
			[336, 65, 100],
			[345, 72, 118],
			[372, 70, 150],
			[392, 56, 180],
			[395, 48.4, 188]
		],
		'cable',
		'stroke-width="1.6"'
	);
	s += hole(395, 188, 3);
	// amp -> left speaker (along the bottom, up the plate)
	s += path3(
		[
			[326, 64, 70],
			[326, 67, 52],
			[316, 62, 34],
			[290, 58, 32],
			[200, 58, 32],
			[130, 56, 32],
			[85, 52, 38],
			[68, 49.5, 70],
			[64, 48.4, 130],
			[60, 48.4, 188]
		],
		'cable',
		'stroke-width="1.6"'
	);
	s += hole(60, 188, 3);
	// Pi power lead into the plate
	s += wb(106, 58, 79, 11, 7, 7, 'dark');
	s += path3(
		[
			[107, 61, 82],
			[98, 57, 86],
			[91, 50, 92],
			[90, 48.4, 94]
		],
		'cable',
		'stroke-width="2.8"'
	);
	s += hole(90, 94, 4.2);
	return s;
}

const STAT_BACK = backLayer() + speaker(60, 245) + speaker(395, 245) + screenLayer();
const STAT_FRONT =
	controlsLayer() + picoLayer() + ampLayer() + micLayer() + piLayer() + cablesLayer();

// ---------- cover ----------
const COVER = (() => {
	const u0 = 105,
		u1 = 365,
		z0 = 30,
		z1 = 150,
		wf = 90.6,
		wt = 3;
	let s = '';
	[
		[111, 36],
		[359, 36],
		[111, 144],
		[359, 144]
	].forEach(([u, z]) => (s += standoff(u, z, FACE, wf, 3)));
	const acr = (t, w, h, r = 0) =>
		`<g transform="${t}"><rect class="acrylic" width="${w}" height="${h}" rx="${r}"/><rect class="detail" width="${w}" height="${h}" rx="${r}"/></g>`;
	s += acr(PLANE_AT_U(u0, wf, z1), wt, z1 - z0) + acr(BTOP(u0, wf, z1), u1 - u0, wt);
	s += acr(PLANE_AT_W(u0, wf + wt, z1), u1 - u0, z1 - z0, 2);
	s += g(
		PLANE_AT_W(u0, wf + wt, z1),
		`<path class="hair" d="M40 120L100 20M60 120L120 20" opacity="0.6"/>`
	);
	[
		[111, 36],
		[359, 36],
		[111, 144],
		[359, 144]
	].forEach(
		([u, z]) => (s += cylW(u, z, 4.2, wf + wt, wf + wt + 2.5, 'brass s', 'brass t', hexHint(4.2)))
	);
	return s;
})();

// ---------- printer ----------
const RU0 = 520; // paper roll: left end, u (80 mm wide, Ø 80)
function printer(lid) {
	const { u, z, width: pw, depth: pd } = PRINTER;
	const w0 = FACE,
		w1 = PW1,
		z1 = z + pd,
		th = rad(lid * MAX_LID_DEG),
		sn = Math.sin(th),
		cs = Math.cos(th);
	let s = wb(u, w0, z, pw, w1 - w0, pd, 'dark', { left: 'f', top: 't', front: 's' });
	// side: cover-release button
	s += g(
		PLANE_AT_U(u, w0, z1),
		`<circle class="face dark t" cx="${w1 - w0 - 20}" cy="26" r="7"/><circle class="detail" cx="${w1 - w0 - 20}" cy="26" r="4"/>`
	);
	// top face: small panel with two LEDs and FEED
	s += g(
		BTOP(u, w0, z1),
		`<rect class="detail" x="16" y="${w1 - w0 - 54}" width="62" height="34" rx="3"/>
    <circle class="led" cx="30" cy="${w1 - w0 - 40}" r="3"/><circle class="led on" cx="42" cy="${w1 - w0 - 40}" r="3"/>
    <circle class="face plain t" cx="62" cy="${w1 - w0 - 37}" r="6"/><text class="face-text" x="62" y="${w1 - w0 - 24}" font-size="6" text-anchor="middle">FEED</text>`
	);
	// tear bar (serrated) and paper slot along the bottom front edge
	let teeth = `M0 0H${pw}V3`;
	for (let x = pw; x > 0; x -= 3.5) teeth += `L${r2(x - 1.75)} 5.5L${r2(x - 3.5)} 3`;
	s += g(PLANE_AT_W(u, w1, z + 4), `<path class="face plain t" d="${teeth}Z"/>`);
	s += g(
		PLANE_AT_W(u, w1, z + 6),
		`<rect class="vent" x="8" y="0" width="${pw - 16}" height="2" rx="1"/>`
	);

	if (lid > 0) {
		// opening: the cavity, the roll and its paper path, clipped to the opening
		const ob = (uu, ww, zz) => [uu, ww, zz];
		let c = `<polygon class="cavity" points="${[ob(474, w1, 326), ob(606, w1, 326), ob(606, w1, 156), ob(474, w1, 156)].map((p) => P3(p).join(',')).join(' ')}"/>`;
		c += poly(
			[ob(474, 68, 326), ob(606, 68, 326), ob(606, 68, 156), ob(474, 68, 156)].map(P3),
			'face cavity'
		);
		c += poly(
			[ob(474, 68, 156), ob(606, 68, 156), ob(606, w1, 156), ob(474, w1, 156)].map(P3),
			'face dark t'
		);
		c += poly(
			[ob(606, 68, 326), ob(606, w1, 326), ob(606, w1, 156), ob(606, 68, 156)].map(P3),
			'face dark f'
		);
		// paper path from the roll to the exit
		const path = [
			[164, 198],
			[168, 190],
			[171, 176],
			[172.5, 160]
		];
		const edge = (uu) => path.map(([ww, zz]) => P3([uu, ww, zz]));
		c += poly([...edge(RU0), ...edge(RU0 + 80).reverse()], 'face paper');
		// roll: hull of both end circles, then the visible end
		const cw = 124,
			cz = 198,
			rr = 40,
			N = 32;
		const ring = (uu) =>
			Array.from({ length: N }, (_, i) => {
				const a = (i / N) * 2 * Math.PI;
				return P3([uu, cw + rr * Math.cos(a), cz + rr * Math.sin(a)]);
			});
		c += poly(hull([...ring(RU0), ...ring(RU0 + 80)]), 'face paper');
		[RU0 + 20, RU0 + 40, RU0 + 60].forEach((uu) => {
			const pts = Array.from({ length: 19 }, (_, i) => {
				const a = rad(-45 + i * 10);
				return P3([uu, cw + rr * Math.cos(a), cz + rr * Math.sin(a)]);
			});
			c += `<polyline class="paper-ink" points="${pts.map((p) => p.join(',')).join(' ')}" opacity="0.6"/>`;
		});
		c += g(
			PLANE_AT_U(RU0, cw - rr, cz + rr),
			`<circle class="face paper" cx="40" cy="40" r="40"/><circle class="paper-ink" cx="40" cy="40" r="33"/><circle class="paper-ink" cx="40" cy="40" r="26"/><circle class="paper-ink" cx="40" cy="40" r="19"/><circle class="face plain f" cx="40" cy="40" r="6"/><circle class="cavity" cx="40" cy="40" r="2.6"/>`
		);
		s += `<g clip-path="url(#w-cav)">${c}</g>`;
	}

	// lid: a slab hinged at the top edge, outer face turned toward the viewer as it opens
	const lp = (L, off, uu) => [uu, w1 + L * sn + off * cs, z1 - L * cs + off * sn];
	const LL = pd - 6,
		T = 8,
		LP = K.plane([w1, W - u, z1], [0, -1, 0], [sn, 0, -cs]);
	s += poly([lp(0, 0, u), lp(LL, 0, u), lp(LL, -T, u), lp(0, -T, u)].map(P3), 'face dark f');
	if (sn - cs > 0)
		s += poly(
			[lp(LL, 0, u), lp(LL, 0, u + pw), lp(LL, -T, u + pw), lp(LL, -T, u)].map(P3),
			'face dark s'
		);
	s += g(
		LP,
		`<rect class="face dark t" width="${pw}" height="${LL}"/><rect class="hair" x="5" y="8" width="${pw - 10}" height="${LL - 14}" rx="4"/><rect class="detail" x="16" y="38" width="${pw - 32}" height="${LL - 80}" rx="5"/><path class="hair" d="M30 ${LL - 22}H${pw - 30}M30 ${LL - 17}H${pw - 30}M30 ${LL - 12}H${pw - 30}"/><rect class="face plain f" x="0" y="-3" width="16" height="9" rx="2"/><rect class="face plain f" x="${pw - 16}" y="-3" width="16" height="9" rx="2"/>`
	);

	// paper hanging from the exit (shown open or closed)
	const pa = (t, uu) => P3([uu, 173.5 + 7.5 * t, 155 - 93 * t]);
	s += poly([pa(0, RU0), pa(0, RU0 + 80), pa(1, RU0 + 80), pa(1, RU0)], 'face paper');
	[
		[0.15, 0.2],
		[0.3, 0.45],
		[0.45, 0.15],
		[0.6, 0.35],
		[0.75, 0.25]
	].forEach(([t, sh]) => {
		const p = pa(t, RU0 + 8),
			q = pa(t, RU0 + 72 - 64 * sh);
		s += `<line class="paper-ink" x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}"/>`;
	});
	return s;
}

// ---------- dimensions ----------
const DIMS = (() => {
	let s = dim(Pt(0, FACE, -24), Pt(PLATE.w, FACE, -24), '640', [0, 24]);
	s += dim(Pt(-26, FACE, 0), Pt(-26, FACE, PLATE.h), '360', [-12, 5], 'end');
	const a = Pt(690, 0, 350),
		b = Pt(690, PW1, 350);
	s += dim(a, b, '48 / 173', [0, -12]);
	const t = Pt(690, FACE, 350),
		L = 6;
	s += `<line class="dim" x1="${t[0] - L * 0.5}" y1="${t[1] + L * 0.87}" x2="${t[0] + L * 0.5}" y2="${t[1] - L * 0.87}"/>`;
	return s;
})();

// ---------- callouts (numbers and label slots are fixed; a part that is not drawn drops out) ----------
// Numbers run clockwise from the top left (left column: 1, then 13 down to 9). Optional parts leave a gap.
const ITEMS = [
	{
		n: 1,
		name: 'Wall plate',
		fact: '18 mm oak, 30 off wall',
		dot: Pt(250, FACE, 350),
		lab: [270, 110],
		side: 'l'
	},
	{
		n: 2,
		name: 'Printer',
		fact: 'MUNBYN, wall-hung',
		dot: Pt(560, 100, 330),
		lab: [1010, 250],
		side: 'r'
	},
	{
		n: 3,
		name: 'Paper roll',
		fact: '80 mm, Ø 80',
		dot: Pt(548, 160, 186),
		lab: [1010, 330],
		side: 'r',
		when: (s) => s.lid > 0
	},
	{
		n: 4,
		name: 'Pico 2 WH',
		fact: 'reads the dials',
		dot: Pt(420, PICOF, 135),
		lab: [1010, 405],
		side: 'r'
	},
	{
		n: 5,
		name: 'Controls',
		fact: 'WHO, WHAT, PRINT',
		dot: Pt(440, 66, 95),
		lab: [1010, 480],
		side: 'r'
	},
	{
		n: 6,
		name: 'Amp',
		fact: '2×5 W, fed by mic board',
		dot: Pt(330, AMPF, 88),
		lab: [1010, 555],
		side: 'r'
	},
	{
		n: 7,
		name: 'Acrylic cover',
		fact: '3 mm, on standoffs',
		dot: Pt(359, 93.6, 36),
		lab: [1010, 630],
		side: 'r',
		when: (s) => s.cover
	},
	{ n: 8, name: 'Power', fact: 'one cord', dot: Pt(614, 14, -52), lab: [1010, 760], side: 'r' },
	{
		n: 9,
		name: 'Pi 5',
		fact: '4GB, Active Cooler',
		dot: Pt(140, PIF, 74),
		lab: [270, 760],
		side: 'l'
	},
	{
		n: 10,
		name: 'Mic board',
		fact: 'XVF3800, echo-cancelling',
		dot: Pt(255, MICF, 64),
		lab: [270, 680],
		side: 'l'
	},
	{
		n: 11,
		name: 'FFC ribbon',
		fact: '22→15-pin adapter',
		dot: Pt(187, 63, 153),
		lab: [270, 600],
		side: 'l'
	},
	{
		n: 12,
		name: 'Speakers',
		fact: '3" drivers, sealed boxes',
		dot: Pt(40, FACE + 3, 275),
		lab: [270, 270],
		side: 'l'
	},
	{
		n: 13,
		name: 'Screen',
		fact: '10.1" DSI, on standoffs',
		dot: Pt(140, 66, 305),
		lab: [270, 190],
		side: 'l'
	}
];

const clamp01 = (x) => Math.min(1, Math.max(0, +x || 0));
export function renderWall(state = {}) {
	const st = { cover: !!state.cover, lid: clamp01(state.printerLid) };
	let svg = svgOpen(
		'0 0 1300 950',
		'A wooden plate hung on a wall: a lit screen, two brass speakers, a Raspberry Pi 5, mic board, amp, dials, a red print button and a wall-mounted receipt printer'
	);
	svg += DEFS + STAT_BACK + printer(st.lid) + STAT_FRONT + (st.cover ? COVER : '') + DIMS;
	const callouts = [];
	for (const it of ITEMS) {
		if (it.when && !it.when(st)) continue;
		callouts.push({ n: it.n, name: it.name, fact: it.fact });
		svg += callout(it.n, it.dot, it.lab, it.name, it.fact, it.side);
	}
	return { svg: svg + '</svg>', callouts };
}
