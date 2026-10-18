// Fig 1 v2: the compact chota box, drawn at runtime so the lids can open.
// renderBox(state) -> { svg, callouts }. Pure string building; imports only common.mjs.
import { kernel, frame, callout, svgOpen, dim } from './common.mjs';

// ---- sizes (mm). Change a measured number here; the drawing and the cut list follow. ----
export const S = {
	t: 12, // wall, base and divider thickness (birch ply)
	lidT: 20, // lid and service-lid depth: 14 mm frame strips on edge + 6 mm ply skin
	screen: [235, 161], // Waveshare 10.1" DSI (C) module, from box.md, unverified
	lip: 4.5, // wood lip left round the screen glass
	band: 50, // plain band under the screen: keeps the lid long enough to open over the deck
	driver: 103.5, // 3.5" Dayton ND91-8 frame per Dayton's page (85 mm cut-out); a retailer says 93/77: check with one in hand
	bass: 24, // extra wall height so the front-mounted driver and its rebate fit the face under the deck
	strip: 42, // fixed hinge strip along the back
	printer: { pw: 140, pd: 180, ph: 125 }, // MUNBYN ITPP098P, Newegg listing (7.09 x 5.51 x 4.92 in), unmeasured
	cableGap: 40, // behind the printer for its USB and power plugs
	deckGap: 34, // deck top to the lid's inner face (knobs are 20, toggles 18)
	deck: 9
};
const t = S.t;
const lidW = S.screen[0] + 2 * S.lip; // 244
const lidD = S.screen[1] + 2 * S.lip + S.band; // 220
const zoneL = lidW; // divider centre line = lid's right edge
const bayIn = S.printer.pw + 22; // printer + finger room
export const W = Math.round(zoneL + t / 2 + bayIn + t); // 424
export const D = S.strip + lidD; // 262
const RIM = t + S.printer.ph + 3 + S.bass; // wall tops: printer + 3 mm clearance + bass room = 164
export const H = RIM + S.lidT; // 184
const DECK = RIM - S.deckGap; // deck top, 130
const divU = zoneL - t / 2; // divider u 238..250
const bayU = divU + t; // bay interior from 250
const PR = { u: bayU + (bayIn - S.printer.pw) / 2, w: t + S.cableGap, z: t, ...S.printer };
const exitW = PR.w + PR.pd - 10; // paper leaves ~10 mm behind the printer's front
const SPK = [67, 183]; // speaker centres, in one shared chamber across the left zone
const SPK_Z = 66; // lowest centre whose frame rebate clears the base
const CH_D = 90; // chamber depth: the deck behind it keeps 118 mm clear for deep controls
const PLENUM = 4; // strips on the chamber top: the camera ribbon and mic lead run over it
const MIC_U = 62,
	MIC_Z = RIM - 17; // ReSpeaker Lite flat behind the front rim, above the deck, away from the drivers
const TALK_U = 115,
	TALK_Z = RIM - 17; // on the rim between mic and camera
const CAM_U = 168,
	CAM_Z = RIM - 17; // front rim, above the deck
const INK = { x: 39, y: 28, bw: 103, bd: 78.5, aw: 84.8, ad: 63.6 }; // Waveshare 4.2" e-ink: board and active area, on the service lid (x from its left edge, y from the hinge)
const OLED = [
	// [u, w, window w, window d, text]: amber OLEDs behind smoked acrylic, run by the Pico
	[48, 55, 30, 15, 'KID2'],
	[208, 55, 30, 15, 'WEEKEND'],
	[143, 143, 56, 28, 'LISTENING…'] // 2.42" status
];
// The face on the bay front, centred on the bay: a GlowBit 8×8 (61 mm square, WS2812B) behind smoked acrylic,
// the LD2450 radar behind a plain window under it, then the knob and three small buttons, two thin vents at the foot
const FACE = { u: (bayU + W - t) / 2, z: 112, board: 61, n: 8 };
const RADAR = { z: 64, w: 50, h: 12 }; // window: no metal in front of a 24 GHz radar
const CTRL_Z = 38,
	KNOB_U = FACE.u - 38,
	BTN_U = [FACE.u + 4, FACE.u + 24, FACE.u + 44];
const STRIP = { z: 3, h: 6, in: 16 }; // light strip groove in the base's front edge
export const OPEN_AT = 110; // lid rotation: 70 deg from flat, leaning back

/** Air inside the speaker chamber, litres, before the drivers and wool take their share. */
export const chamberL = () =>
	+(((divU - t) * (DECK - S.deck - PLENUM - t - 6) * (CH_D - 6)) / 1e6).toFixed(1);

// ---- cut list, from the same numbers ----
export function cutList() {
	const inner = D - 2 * t,
		gap = 1;
	const svcW = W - lidW;
	return [
		{
			part: 'Base',
			qty: 1,
			size: [W, D, t],
			mat: '12 mm birch ply',
			note: `groove ${STRIP.h + 1} × 8 along the front edge, ${STRIP.in} mm in from each end, for the light strip under frosted acrylic`
		},
		{
			part: 'Front and back walls',
			qty: 2,
			size: [W, RIM - t, t],
			mat: '12 mm birch ply',
			note: `front: two 85 mm holes, each in a 104.5 × 4 mm rebate (template from a driver in hand); rim: two mic holes, TALK, camera window; bay front: ${FACE.board + 3} mm square face window, ${RADAR.w} × ${RADAR.h} radar window, Ø7 knob hole counterbored Ø14 × 7 from inside, three Ø7 button holes, two 100 × 3 vent slots at the foot. Back: Ø22 for the Pi lead at the left, Ø16 for the 24 V lead at the right, six 8 × 24 exhaust slots high on the right of the left zone, the bay's vents across its back. Cut before glue-up`
		},
		{
			part: 'Ends',
			qty: 2,
			size: [inner, RIM - t, t],
			mat: '12 mm birch ply',
			note: 'between front and back; vents low on the left; on the right a styled vent beside the printer (brass mesh behind a routed pattern)'
		},
		{
			part: 'Divider',
			qty: 1,
			size: [inner, RIM - t, t],
			mat: '12 mm birch ply',
			note: "carries both lids' inner edges; 25 mm hole for USB; Ø10 hole low and behind the speaker chamber for the face, radar, light strip and button wires"
		},
		{
			part: 'Hinge strip',
			qty: 1,
			size: [W, S.strip, S.lidT],
			mat: 'hardwood (Tas oak)',
			note: '25 × 12 notch for the screen ribbon'
		},
		{
			part: 'Strip cleat',
			qty: 1,
			size: [W - 2 * t, 12, 12],
			mat: 'hardwood',
			note: "inside the back wall's top; screw the strip down through it"
		},
		{
			part: 'Speaker chamber, back',
			qty: 1,
			size: [divU - t, DECK - S.deck - PLENUM - t - 6, 6],
			mat: '6 mm ply',
			note: `one chamber for both drivers: the base, front wall, left end and divider are its other sides; ~${chamberL()} L inside; glue + silicone every seam, wool inside`
		},
		{
			part: 'Speaker chamber, top',
			qty: 1,
			size: [divU - t, CH_D, 6],
			mat: '6 mm ply',
			note: `the front of the deck rests on ${PLENUM} mm strips along it; the gap carries the camera ribbon and mic lead`
		},
		{
			part: 'Deck',
			qty: 1,
			size: [divU - t - gap, D - t - S.strip - gap, S.deck],
			mat: '9 mm birch ply',
			note: 'lifts out with its wiring; nothing deep over the speaker chamber (front 90 mm); three OLED windows (36 × 21 behind each dial, 62 × 34 by PRINT) under smoked acrylic; 30 × 10 slot at the front-left corner for the ribbon and mic lead; notch the front edge 90 × 3 if the mic board needs it'
		},
		{
			part: 'Deck cleats',
			qty: 2,
			size: [inner - CH_D, 12, 12],
			mat: 'pine',
			note: `on the left end and divider, top ${DECK - S.deck - t} mm above the base`
		},
		{
			part: 'Lid frame, front',
			qty: 1,
			size: [lidW - gap, S.lidT - 6, t],
			mat: 'hardwood',
			note: '7.5 mm rebate for the screen glass, all four rails'
		},
		{
			part: 'Lid frame, back',
			qty: 1,
			size: [lidW - gap, S.lidT - 6, 20],
			mat: 'hardwood',
			note: 'hinges and chain screw into this, never the ply'
		},
		{
			part: 'Lid frame, sides',
			qty: 2,
			size: [lidD - gap - t - 20, S.lidT - 6, t],
			mat: 'hardwood',
			note: 'notch one for the screen ribbon'
		},
		{
			part: 'Lid cross-rail',
			qty: 1,
			size: [lidW - 2 * t, 22, 10],
			mat: 'hardwood',
			note: 'between the screen and the band; stiffens the lid'
		},
		{
			part: 'Lid skin',
			qty: 1,
			size: [lidW - gap, lidD - gap, 6],
			mat: '6 mm ply',
			note: 'glued on: the lid becomes a torsion box'
		},
		{
			part: 'Screen clips',
			qty: 4,
			size: [30, 15, 6],
			mat: 'ply offcut',
			note: 'screwed to the frame behind the module, 1–2 mm foam pad'
		},
		{
			part: 'Service lid frame, front',
			qty: 1,
			size: [svcW - gap, S.lidT - 6, t],
			mat: 'hardwood'
		},
		{
			part: 'Service lid frame, back',
			qty: 1,
			size: [svcW - gap, S.lidT - 6, 20],
			mat: 'hardwood',
			note: 'hinges screw into this'
		},
		{
			part: 'Service lid frame, sides',
			qty: 2,
			size: [lidD - gap - t - 20, S.lidT - 6, t],
			mat: 'hardwood'
		},
		{
			part: 'Paper guide',
			qty: 1,
			size: [100, 20, 6],
			mat: 'hardwood',
			note: "under the slot, angled 10–15° out so the curl can't fold back"
		},
		{
			part: 'Service lid skin',
			qty: 1,
			size: [svcW - gap, lidD - gap, 6],
			mat: '6 mm ply',
			note: `slot 90 × 5 with a chamfered mouth, at least 15 mm clear of the front strip; angled guide under it. Window ${INK.aw + 1} × ${INK.ad + 1} for the 4" e-ink, ${Math.round(exitW - S.strip - 2 - INK.y - INK.bd)} mm behind the slot; its board clips under the skin`
		}
	];
}
// The box's own fittings; electronics are in parts.mjs.
export const hardware = [
	{
		item: 'Brass butt hinges, 40 mm',
		qty: '2 pairs',
		note: 'mortised into the hardwood back rails and hinge strip'
	},
	{
		item: 'Brass chain, about 150 mm',
		qty: 2,
		note: 'on screw eyes in hardwood; stops the lid 20° past upright'
	},
	{
		item: 'Brass mesh',
		qty: '1 sheet',
		note: 'two speaker grilles and the mic grille; 3–4 mm clear of the cones, held so it can’t rattle'
	},
	{
		item: 'Brass slide for the camera shutter',
		qty: 1,
		note: 'in a routed groove over the camera window'
	},
	{
		item: 'Brass tear bar, 90 mm',
		qty: 1,
		note: 'along the slot’s front edge (from Paper Console)'
	},
	{ item: 'Magnet pairs', qty: 2, note: 'lid catches' },
	{ item: 'Dowels, 6 mm', qty: 2, note: 'seat the service lid so the slot lines up' },
	{
		item: 'M3 brass screws',
		qty: 8,
		note: 'deck down onto its cleats; it lifts out as one harness'
	},
	{
		item: 'Rubber feet, 8–10 mm',
		qty: 4,
		note: `airflow under the box; ${H + 8}–${H + 10} mm tall overall`
	},
	{
		item: 'Closed-cell foam, 1–2 mm',
		qty: '1 sheet',
		note: 'gaskets: mic board, screen clips, driver frames'
	},
	{
		item: 'Frosted acrylic strip, 3 mm',
		qty: 1,
		note: `over the light-strip groove, ${W - 2 * STRIP.in} mm long`
	},
	{ item: 'Polyfill (pillow stuffing)', qty: 'a handful', note: 'loosely in the speaker chamber' },
	{
		item: 'Rubber grommets, 22 and 16 mm',
		qty: 2,
		note: 'the two power leads through the back wall'
	},
	{ item: 'PVA wood glue, finish oil', qty: 1, note: 'glue-up and finish' }
];

const rad = (d) => (d * Math.PI) / 180;
const f1 = (n) => +(+n).toFixed(2);

export function renderBox(state = {}) {
	const st = { lid: 0, flap: 0, plid: 0, xray: false, labels: true, ...state };
	const SC = 1.0;
	// centre the drawing: probe the extremes with a throwaway kernel
	const probeK = kernel(0, 0, SC),
		probeF = frame(probeK, W, D);
	const extP = [
		[-40, -40, 0],
		[W + 30, D, 0],
		[0, D + 40, 0],
		[-40, -40, 380],
		[0, -30, 375],
		[W, 0, H]
	].map((p) => probeF.Pt(...p));
	const xs = extP.map((p) => p[0]),
		ys = extP.map((p) => p[1]);
	const OX = 650 - (Math.min(...xs) + Math.max(...xs)) / 2,
		OY = 480 - (Math.min(...ys) + Math.max(...ys)) / 2;
	const K = kernel(OX, OY, SC),
		F = frame(K, W, D);
	const { Pt, BTOP, PLANE_AT_W, PLANE_AT_U, bbox, bcyl } = F;

	const g = (tr, inner, extra = '') => `<g transform="${tr}"${extra}>${inner}</g>`;
	const toWorld = (o) => [o[1], W - o[0], o[2]];
	const vec = (v) => [v[1], -v[0], v[2]];
	const PL = (o, U, V) => K.plane(toWorld(o), vec(U), vec(V));
	const poly = (pts, cls) =>
		`<polygon class="${cls}" points="${pts.map((p) => p.map(f1).join(',')).join(' ')}"/>`;
	const path3 = (pts, cls) => {
		const s = pts.map((p) => Pt(...p));
		let d = `M${s[0][0]} ${s[0][1]}`;
		for (let i = 1; i < s.length - 1; i++) {
			const m = [(s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2].map(f1);
			d += ` Q${s[i][0]} ${s[i][1]} ${m[0]} ${m[1]}`;
		}
		const e = s[s.length - 1];
		return `<path class="${cls}" d="${d} L${e[0]} ${e[1]}"/>`;
	};
	const rod = (p, q, wid = 3.4, cls = 'face brass f') => {
		const dx = q[0] - p[0],
			dy = q[1] - p[1],
			L = Math.hypot(dx, dy) || 1,
			nx = ((-dy / L) * wid) / 2,
			ny = ((dx / L) * wid) / 2;
		return poly(
			[
				[p[0] + nx, p[1] + ny],
				[q[0] + nx, q[1] + ny],
				[q[0] - nx, q[1] - ny],
				[p[0] - nx, p[1] - ny]
			],
			cls
		);
	};
	const circTop = (u, w, z, r, cls) =>
		g(BTOP(u - r, w - r, z), `<circle class="${cls}" cx="${r}" cy="${r}" r="${r}"/>`);

	// A slab hinged along u at (hw, hz). Closed (a = 0) it runs toward +w, thickness downward.
	// a rotates its far edge up; 110 leans it back 20 degrees. Returns svg plus the inner face's transform.
	function slab({ u0, du, hw, hz, L, T, a, mat = 'wood', outer = '', inner = '', edgeInner = '' }) {
		const c = Math.cos(rad(a)),
			s = Math.sin(rad(a));
		const Sv = [0, c, s],
			Td = [0, s, -c],
			U = [1, 0, 0];
		const p = (sx, tx, ux = 0) => [u0 + ux, hw + sx * c + tx * s, hz + sx * s - tx * c];
		let out = g(
			PL(p(0, 0), Sv, Td),
			`<rect class="face ${mat} f" width="${L}" height="${T}"/>${edgeInner}`
		);
		if (a < 45)
			out += g(
				PL(p(0, 0), U, Sv),
				`<rect class="face ${mat} t" width="${du}" height="${L}"/>${outer}`
			);
		if (a > 45)
			out += g(
				PL(p(L, T), U, [0, -c, -s]),
				`<rect class="face ${mat} s" width="${du}" height="${L}"/>${inner}`
			);
		out += g(
			PL(p(L, 0), U, Td),
			`<rect class="face ${mat} ${a < 60 ? 's' : 't'}" width="${du}" height="${T}"/>`
		);
		return { svg: out, p };
	}

	const parts = []; // callout anchors: [n, screenPoint, name, fact]
	const mark = (n, pt, name, fact) => parts.push({ n, pt, name, fact });
	let s = '';

	// ---- shell, back first ----
	s += bbox(0, 0, 0, W, D, t, 'wood'); // base
	s += bbox(0, 0, t, W, t, RIM - t, 'wood'); // back wall
	s += bbox(W - t, t, t, t, D - 2 * t, RIM - t, 'wood'); // right end (inner face shows)
	s +=
		bbox(0, t, t, t, S.strip - t, RIM - t, 'wood') +
		bbox(divU, t, t, t, S.strip - t, RIM - t, 'wood'); // end and divider under the strip
	s += bbox(0, 0, RIM, W, S.strip, S.lidT, 'wood'); // hinge strip
	for (const u of [24, lidW - 54, lidW + 24, W - 54])
		// fixed hinge leaves
		s += g(
			BTOP(u, S.strip - 7, H),
			`<rect class="face brass t" width="30" height="7"/><circle class="detail" cx="8" cy="3.5" r="1.2"/><circle class="detail" cx="22" cy="3.5" r="1.2"/>`
		);

	// ---- service lid over the printer bay ----
	const flapA = st.flap;
	const slotX = PR.u + PR.pw / 2 - 45 - lidW,
		slotY = exitW - S.strip - 2;
	const slotDraw = `<rect class="cut-fill" x="${f1(slotX)}" y="${f1(slotY)}" width="90" height="5" rx="1"/>`;
	const inkAx = INK.x + (INK.bw - INK.aw) / 2,
		inkAy = INK.y + (INK.bd - INK.ad) / 2;
	const inkDraw = `<rect class="face dark t" x="${inkAx - 3}" y="${inkAy - 3}" width="${INK.aw + 6}" height="${INK.ad + 6}" rx="2"/><rect class="paper" x="${inkAx}" y="${inkAy}" width="${INK.aw}" height="${INK.ad}" stroke="none"/>
    <rect class="face accent t" x="${inkAx + 6}" y="${inkAy + 6}" width="18" height="18" rx="2"/>
    ${[9, 16, 23].map((y, i) => `<line class="paper-ink" x1="${inkAx + 30}" y1="${inkAy + y}" x2="${inkAx + (i ? 66 : 78)}" y2="${inkAy + y}"/>`).join('')}
    ${[34, 41, 48].map((y, i) => `<line class="paper-ink" x1="${inkAx + 6}" y1="${inkAy + y}" x2="${inkAx + (i % 2 ? 58 : 74)}" y2="${inkAy + y}"/>`).join('')}`;
	const flapOuter = `<rect class="hair" x="${t}" y="${t}" width="${W - lidW - 2 * t}" height="${lidD - 2 * t}"/>${slotDraw}${inkDraw}
    <rect class="face brass t" x="${(W - lidW) / 2 - 12}" y="${lidD - 6}" width="24" height="4" rx="2"/>`;
	const flapInner = `<rect class="hair" x="${t}" y="${t}" width="${W - lidW - 2 * t}" height="${lidD - 2 * t}"/>
    <rect class="cut-fill" x="${f1(slotX)}" y="${f1(lidD - slotY - 5)}" width="90" height="5" rx="1"/>
    <rect class="face pcb t" x="${INK.x}" y="${lidD - INK.y - INK.bd}" width="${INK.bw}" height="${INK.bd}" rx="2"/>`;
	const flap = () =>
		slab({
			u0: lidW,
			du: W - lidW,
			hw: S.strip,
			hz: H,
			L: lidD,
			T: S.lidT,
			a: flapA,
			outer: flapOuter,
			inner: flapInner
		});
	if (flapA >= 75) s += flap().svg;

	// ---- the printer (seen when the service lid is up) ----
	const P = PR,
		topZ = P.z + P.ph,
		bodyZ = topZ - 25,
		hingeW = P.w + 48;
	if (flapA > 2) {
		s += bbox(P.u, P.w, P.z, P.pw, P.pd, P.ph - 25, 'dark', 4); // lower body
		s += bbox(P.u, P.w, bodyZ, P.pw, hingeW - P.w, 25, 'dark', 3); // rear hump with the hinge
		// control panel on the rear hump: 2 LEDs and FEED
		s +=
			circTop(P.u + P.pw - 22, P.w + 14, topZ, 2.4, 'led on') +
			circTop(P.u + P.pw - 12, P.w + 14, topZ, 2.4, 'led');
		s += bcyl(P.u + P.pw - 17, P.w + 32, topZ, 6, 2, 'plain');
		s += g(
			BTOP(P.u + P.pw - 34, P.w + 40, topZ),
			`<text class="face-text" x="0" y="0" font-size="5">FEED</text>`
		);
		const pl = st.plid;
		if (pl > 8) {
			// cavity and roll
			s += g(
				BTOP(P.u + 6, hingeW + 2, bodyZ),
				`<rect class="cavity" width="${P.pw - 12}" height="${P.pd - (hingeW - P.w) - 14}" rx="3"/>`
			);
			const ru0 = P.u + (P.pw - 80) / 2,
				rw = hingeW + 52,
				rz = bodyZ - 18,
				R = 40;
			const pts = [];
			for (const uu of [ru0, ru0 + 80])
				for (let i = 0; i < 36; i++) {
					const th = (i / 36) * 2 * Math.PI;
					pts.push(Pt(uu, rw + R * Math.cos(th), rz + R * Math.sin(th)));
				}
			s += poly(hull(pts), 'face paper t');
			s += g(
				PL([ru0, rw, rz], [0, 1, 0], [0, 0, -1]),
				`<circle class="face paper f" r="${R}"/><circle class="hair" r="${R - 9}"/><circle class="hair" r="${R - 20}"/><circle class="face dark f" r="6"/>`
			);
			// paper from the roll to the exit
			s += poly(
				[
					Pt(ru0, rw + R - 6, bodyZ + 1),
					Pt(ru0 + 80, rw + R - 6, bodyZ + 1),
					Pt(ru0 + 80, P.w + P.pd - 2, bodyZ + 1),
					Pt(ru0, P.w + P.pd - 2, bodyZ + 1)
				],
				'face paper t'
			);
			// body's front and left faces again, so they hide the bottom of the roll
			s += g(
				PLANE_AT_W(P.u, P.w + P.pd, bodyZ),
				`<rect class="face dark s" width="${P.pw}" height="${bodyZ - P.z}" rx="4"/>`
			);
			s += g(
				PLANE_AT_U(P.u, P.w, bodyZ),
				`<rect class="face dark f" width="${P.pd}" height="${bodyZ - P.z}" rx="4"/>`
			);
			mark(6, Pt(ru0, rw, rz + 10), 'Paper roll', '80 mm wide, Ø 80 max');
		}
		// tear bar and exit on the front face, cover-release button
		s += g(
			PLANE_AT_W(P.u, P.w + P.pd, bodyZ),
			`<rect class="cut-fill" x="20" y="-1.5" width="${P.pw - 40}" height="3"/>${Array.from({ length: 24 }, (_, i) => `<line class="detail" x1="${22 + i * 4.2}" y1="1.5" x2="${24 + i * 4.2}" y2="4"/>`).join('')}
      <circle class="face plain f" cx="${P.pw - 16}" cy="30" r="7"/><circle class="detail" cx="${P.pw - 16}" cy="30" r="4"/>`
		);
		const pc = slab({
			u0: P.u,
			du: P.pw,
			hw: hingeW,
			hz: topZ,
			L: P.pd - (hingeW - P.w),
			T: 25,
			a: pl,
			mat: 'dark',
			outer: `<rect class="detail" x="6" y="0" width="${P.pw - 12}" height="${P.pd - (hingeW - P.w) - 4}" rx="6"/>`,
			inner: `<rect class="detail" x="16" y="8" width="${P.pw - 32}" height="40" rx="4"/>`
		});
		s += pc.svg;
		if (pl <= 8)
			mark(5, Pt(P.u + 30, P.w + 120, topZ), 'Printer', `MUNBYN, ${P.pw}×${P.pd}×${P.ph} listed`);
		// USB + power plugs at its back
		s += path3(
			[
				[P.u + 30, P.w, P.z + 30],
				[P.u + 30, P.w - 20, P.z + 20],
				[P.u + 10, P.w - 30, P.z + 4],
				[divU + t, P.w - 30, P.z + 4]
			],
			'cable'
		);
	}

	// ---- divider ----
	s += bbox(divU, S.strip, t, t, D - t - S.strip, RIM - t, 'wood');

	// ---- the lid (screen + speakers) ----
	const lidA = st.lid;
	const [sw, sh] = S.screen,
		lp = S.lip;
	const lidInner = `
    <rect class="glass" x="${lp}" y="${lp}" width="${sw}" height="${sh}" rx="2"/>
    <rect class="screen-on" x="${lp + 9}" y="${lp + 12}" width="${sw - 18}" height="${sh - 24}"/>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + 88}" text-anchor="middle" font-size="46">06:52</text>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + 112}" text-anchor="middle" font-size="9" opacity=".8">the literary clock</text>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + 126}" text-anchor="middle" font-size="7" opacity=".6">dims at 9 pm, off at night</text>
    <rect class="face brass f" x="${lidW / 2 - 30}" y="${lp + sh + 16}" width="60" height="20" rx="2"/>
    <text class="face-text" x="${lidW / 2}" y="${lp + sh + 30}" text-anchor="middle" font-size="10" font-weight="600">CHOTA</text>`;
	const lidOuter = `<rect class="hair" x="${t}" y="${t}" width="${lidW - 2 * t}" height="${lidD - 2 * t}"/>
    <rect class="face brass t" x="${lidW / 2 - 14}" y="${lidD - 6}" width="28" height="4" rx="2"/>`;
	const lid = () =>
		slab({
			u0: 0,
			du: lidW,
			hw: S.strip,
			hz: H,
			L: lidD,
			T: S.lidT,
			a: lidA,
			inner: lidInner,
			outer: lidOuter
		});
	const chain = () => {
		if (lidA < 20) return '';
		const L0 = lid(),
			a = L0.p(95, S.lidT, 6),
			b = [6, 105, RIM - 4];
		const pa = Pt(...a),
			pb = Pt(...b);
		const full = 150,
			dist = Math.hypot(a[1] - b[1], a[2] - b[2]),
			sag = Math.max(0, full - dist) * 0.7;
		const mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2 + sag];
		return `<path class="chain" d="M${pa[0]} ${pa[1]} Q${f1(mid[0])} ${f1(mid[1])} ${pb[0]} ${pb[1]}"/>`;
	};
	const lidSvg = () => {
		const L0 = lid();
		if (lidA > 60) {
			mark(
				1,
				Pt(...L0.p(lidD * 0.55, S.lidT, lidW * 0.3)),
				'Lid screen',
				'10.1" DSI, edge to edge'
			);
			mark(3, Pt(...L0.p(lidD - 2, 0, 0)), 'Lid', 'stops 20° past upright');
		}
		return L0.svg;
	};
	if (lidA >= 75) s += lidSvg() + chain();

	// ---- left zone: insides, deck, controls ----
	const see = st.xray ? ` class="see-through"` : '';
	if (st.xray) {
		// the two power leads in through the back wall: the Pi's at the left, 24 V at the right
		s += path3(
			[
				[40, 0, 40],
				[40, t + 20, 30],
				[90, 60, t + 14]
			],
			'cable'
		);
		// Pi 5 on standoffs, cooler, fan
		for (const [u, w] of [
			[94, 74],
			[175, 74],
			[94, 122],
			[175, 122]
		])
			s += bcyl(u, w, t, 2.5, 8, 'brass');
		s += bbox(90, 70, t + 8, 85, 56, 1.6, 'pcb', 2);
		s +=
			bbox(102, 78, t + 9.6, 58, 42, 8, 'dark', 3) +
			circTop(131, 99, t + 17.6, 13, 'face plain t') +
			circTop(131, 99, t + 17.6, 4, 'face dark t');
		s +=
			bbox(164, 72, t + 9.6, 11, 16, 14, 'plain') +
			bbox(164, 94, t + 9.6, 11, 14, 14, 'plain') +
			bbox(164, 110, t + 9.6, 11, 14, 14, 'plain');
		mark(12, Pt(114, 90, t + 18), 'Pi 5', '4GB, Active Cooler');
		// one sealed speaker chamber behind the front wall, full width of the zone
		s += bbox(t, D - t - CH_D, t, divU - t, CH_D, DECK - S.deck - PLENUM - t, 'dark', 3);
		// amp by the divider, where the 24 V lead comes in; USB sound card on the floor at the left
		s += bbox(178, 22, t, 58, 95, 3, 'pcb', 2) + bbox(190, 40, t + 3, 34, 30, 22, 'dark');
		mark(13, Pt(207, 70, t + 3), 'Amp', 'TPA3116, 24 V');
		s += bbox(30, 60, t, 45, 20, 12, 'plain', 3);
		s += bbox(MIC_U - 43, D - t - 3, MIC_Z - 16, 86, 2, 32, 'pcb'); // ReSpeaker Lite
		// Pico under the deck, clear of the meter and the dial pots
		s += bbox(22, 50, DECK - S.deck - 3, 51, 21, 1.2, 'pcb');
		mark(14, Pt(47, 60, DECK - S.deck - 2), 'Pico 2 WH', 'under the deck');
		// display ribbons
		s += path3(
			[
				[144, 72, t + 10],
				[150, 40, 60],
				[150, t + 6, 120],
				[150, S.strip - 4, H - 6]
			],
			'ffc'
		);
		s += path3(
			[
				[154, 72, t + 10],
				[120, 150, 60],
				[CAM_U, D - t - 6, CAM_Z]
			],
			'ffc'
		); // camera ribbon
		// the face and radar behind the bay front; their leads cross the divider behind the chamber
		s +=
			bbox(
				FACE.u - FACE.board / 2,
				D - t - 3,
				FACE.z - FACE.board / 2,
				FACE.board,
				2,
				FACE.board,
				'pcb'
			) + bbox(FACE.u - 22, D - t - 3, RADAR.z - 7, 44, 2, 15, 'pcb');
		s += path3(
			[
				[172, 76, t + 10],
				[divU, 140, 30],
				[bayU + 5, D - 30, 50],
				[FACE.u - 20, D - t - 4, FACE.z - FACE.board / 2]
			],
			'cable'
		);
		s += path3(
			[
				[175, 100, t + 14],
				[200, 125, t + 30],
				[divU, 100, t + 40]
			],
			'cable'
		);
	}
	s +=
		`<g${see}>` +
		bbox(t, S.strip, DECK - S.deck, divU - t, D - t - S.strip, S.deck, 'wood') +
		`</g>`;
	// deck controls
	let dk = '';
	// analog needle meter where the deck screen was: minutes to the bus, today's max
	dk += bbox(84, 60, DECK, 80, 52, 4, 'brass', 6);
	dk += g(
		BTOP(88, 64, DECK + 4),
		`<rect class="face paper t" width="72" height="44" rx="4"/>${Array.from(
			{ length: 11 },
			(_, i) => {
				const th = rad(200 + i * 14);
				return `<line class="paper-ink" x1="${f1(36 + 26 * Math.cos(th))}" y1="${f1(40 + 26 * Math.sin(th))}" x2="${f1(36 + (i % 5 ? 30 : 33) * Math.cos(th))}" y2="${f1(40 + (i % 5 ? 30 : 33) * Math.sin(th))}"/>`;
			}
		).join(
			''
		)}<line class="detail" x1="36" y1="40" x2="${f1(36 + 31 * Math.cos(rad(lidA > 60 ? 250 : 215)))}" y2="${f1(40 + 31 * Math.sin(rad(lidA > 60 ? 250 : 215)))}" stroke-width="1.6"/><circle class="face dark t" cx="36" cy="40" r="2.5"/><text class="face-text" x="36" y="30" text-anchor="middle" font-size="5">MIN TO BUS</text>`
	);
	// WHO and WHAT knobs with tick marks
	for (const [u, w] of [
		[48, 92],
		[208, 92]
	]) {
		dk += g(
			BTOP(u - 24, w - 24, DECK),
			Array.from({ length: 9 }, (_, i) => {
				const th = rad(135 + i * 33.75);
				return `<line class="detail" x1="${f1(24 + 19 * Math.cos(th))}" y1="${f1(24 + 19 * Math.sin(th))}" x2="${f1(24 + 23 * Math.cos(th))}" y2="${f1(24 + 23 * Math.sin(th))}"/>`;
			}).join('')
		);
		dk +=
			bcyl(u, w, DECK, 15, 20, 'wood') +
			g(
				BTOP(u - 15, w - 15, DECK + 20),
				`<line class="detail" x1="15" y1="15" x2="15" y2="3" stroke-width="2"/>`
			);
	}
	// LEDs
	[90, 110, 130, 150, 170].forEach((u, i) => {
		dk +=
			bcyl(u, 122, DECK, 5, 3, 'dark') +
			circTop(u, 122, DECK + 3, 4, i === 1 || i === 3 ? 'led on' : 'led');
	});
	// toggles and the covered toggle
	for (const u of [28, 46, 64]) {
		dk += bcyl(u, 148, DECK, 6, 2, 'brass') + rod(Pt(u, 148, DECK + 2), Pt(u, 142, DECK + 18), 3.2);
	}
	dk +=
		bcyl(90, 148, DECK, 7, 2, 'brass') +
		rod(Pt(90, 148, DECK + 2), Pt(90, 142, DECK + 16), 4) +
		bbox(82, 130, DECK, 16, 34, 9, 'brass', 2);
	// amber OLEDs: what each dial is set to, and what chota is doing
	for (const [u, w, ow, od, txt] of OLED)
		dk += g(
			BTOP(u - ow / 2 - 3, w - od / 2 - 3, DECK),
			`<rect class="glass" width="${ow + 6}" height="${od + 6}" rx="2"/><rect class="screen-on" x="3" y="3" width="${ow}" height="${od}"/><text class="screen-text" x="${3 + ow / 2}" y="${3 + od / 2 + 2.5}" text-anchor="middle" font-size="7">${txt}</text>`
		);
	// PRINT
	dk +=
		bcyl(205, 135, DECK, 20, 3, 'brass') +
		bcyl(205, 135, DECK + 3, 15, 8, 'accent') +
		circTop(205, 135, DECK + 11, 9, 'accent-hi');
	s += `<g${see}>${dk}</g>`;
	if (lidA > 60) {
		mark(7, Pt(205, 135, DECK + 11), 'PRINT', '30 mm red arcade');
		mark(8, Pt(124, 86, DECK + 4), 'Needle meter', 'minutes to the bus');
		mark(9, Pt(212, 92, DECK + 20), 'WHO + WHAT', 'two dials, wooden knobs');
		mark(10, Pt(64, 142, DECK + 16), 'Toggles', '3 mini + 1 covered');
		mark(18, Pt(143, 143, DECK), 'OLEDs', '3 amber: dials + status');
	}

	// ---- walls in front ----
	s +=
		`<g${see}>` +
		bbox(0, S.strip, t, t, D - t - S.strip, RIM - t, 'wood') +
		bbox(0, D - t, t, W, t, RIM - t, 'wood') +
		`</g>`;
	// front: two speakers either side of the mic grille and TALK; bay vents. left end: vents by the Pi
	const grille = (r) =>
		`<circle class="face brass f" r="${r + 4}"/><circle class="mesh" r="${r}"/>${Array.from(
			{ length: 60 },
			(_, i) => {
				const rr = 3 + Math.floor(i / 6) * 3,
					th = i * 2.4;
				return rr < r - 1
					? `<circle class="face dark s" cx="${f1(rr * Math.cos(th))}" cy="${f1(rr * Math.sin(th))}" r=".9"/>`
					: '';
			}
		).join('')}`;
	for (const u of SPK) s += g(PLANE_AT_W(u, D, SPK_Z), grille(S.driver / 2 - 3));
	mark(2, Pt(SPK[0], D, SPK_Z), 'Speakers', `3.5" ND91 pair, ${chamberL()} L shared`);
	s += g(
		PLANE_AT_W(MIC_U, D, MIC_Z),
		`<rect class="face brass f" x="-30" y="-9" width="60" height="18" rx="9"/>${[-20, 20].map((x) => `<circle class="mesh" cx="${x}" r="6"/><circle class="face dark s" cx="${x}" r="1.4"/>`).join('')}<circle class="led on" cx="0" cy="0" r="2"/>`
	);
	s += g(
		PLANE_AT_W(TALK_U, D, TALK_Z),
		`<circle class="face brass f" r="13"/><circle class="face brass t" r="9"/><text class="face-text" y="26" text-anchor="middle" font-size="7">TALK</text>`
	);
	mark(11, Pt(MIC_U, D, MIC_Z), 'Mic', 'ReSpeaker Lite, 2 mics');
	mark(16, Pt(TALK_U, D, TALK_Z), 'TALK', 'hold: hushes, then listens');
	s += g(
		PLANE_AT_W(CAM_U, D, CAM_Z),
		`<rect class="face brass f" x="-16" y="-9" width="32" height="18" rx="9"/><circle class="glass" r="5"/><circle class="face dark s" r="2"/><rect class="face brass t" x="5" y="-7" width="9" height="14" rx="2"/><circle class="led on" cx="-11" cy="0" r="1.6"/>`
	);
	mark(15, Pt(CAM_U, D, CAM_Z), 'Camera', 'Pi Camera 3, brass shutter');
	// the face: 8×8 pixels behind smoked acrylic, showing two eyes and a mouth; radar window, knob, buttons, foot vents
	const fw = FACE.board + 3,
		pitch = FACE.board / FACE.n;
	const lit = (r, c) =>
		((r === 2 || r === 3) && (c === 2 || c === 5)) || (r === 5 && c > 1 && c < 6);
	s += g(
		PLANE_AT_W(FACE.u - fw / 2, D, FACE.z + fw / 2),
		`<rect class="face brass f" x="-4" y="-4" width="${fw + 8}" height="${fw + 8}" rx="3"/><rect class="glass" width="${fw}" height="${fw}" rx="2"/>${Array.from(
			{ length: FACE.n * FACE.n },
			(_, i) => {
				const r = Math.floor(i / FACE.n),
					c = i % FACE.n,
					x = 1.5 + pitch * (c + 0.5),
					y = 1.5 + pitch * (r + 0.5);
				return lit(r, c)
					? `<circle class="halo" cx="${f1(x)}" cy="${f1(y)}" r="${f1(pitch * 0.6)}"/><rect class="led on" x="${f1(x - 2.2)}" y="${f1(y - 2.2)}" width="4.4" height="4.4" rx="1"/>`
					: `<rect class="led" x="${f1(x - 2.2)}" y="${f1(y - 2.2)}" width="4.4" height="4.4" rx="1" opacity=".35"/>`;
			}
		).join('')}`
	);
	s += g(
		PLANE_AT_W(FACE.u - RADAR.w / 2, D, RADAR.z + RADAR.h / 2),
		`<rect class="glass" width="${RADAR.w}" height="${RADAR.h}" rx="2"/>`
	);
	s += g(
		PLANE_AT_W(KNOB_U, D, CTRL_Z),
		`<circle class="face brass f" r="11"/><circle class="face brass t" r="8"/><line class="detail" x1="0" y1="0" x2="0" y2="-7" stroke-width="1.6"/>`
	);
	for (const u of BTN_U)
		s += g(
			PLANE_AT_W(u, D, CTRL_Z),
			`<circle class="face brass f" r="6"/><circle class="face brass t" r="3.8"/>`
		);
	s += g(
		PLANE_AT_W(FACE.u - 50, D, 22),
		[0, 6]
			.map((y) => `<rect class="vent" x="0" y="${y}" width="100" height="3" rx="1.5"/>`)
			.join('')
	);
	mark(19, Pt(FACE.u, D, FACE.z), 'Face', '8×8 LEDs, radar under');
	mark(21, Pt(KNOB_U, D, CTRL_Z), 'Knob + 3 buttons', 'to the Pico');
	// light strip in the base's front edge: the LEDs facing whoever walks up glow dimly
	const nLed = Math.floor((W - 2 * STRIP.in) / 16.7);
	s += g(
		PLANE_AT_W(STRIP.in, D, STRIP.z + STRIP.h),
		`<rect class="face dark f" width="${W - 2 * STRIP.in}" height="${STRIP.h}" rx="1"/>${Array.from(
			{ length: nLed },
			(_, i) => {
				const x = 8 + i * 16.7,
					on = Math.abs(i - (nLed - 5)) < 3;
				return `${on ? `<rect class="halo" x="${f1(x - 6)}" y="-2" width="12" height="${STRIP.h + 4}" rx="3"/>` : ''}<rect class="led${on ? ' on' : ''}" x="${f1(x - 1.5)}" y="1.5" width="3" height="3"/>`;
			}
		).join('')}`
	);
	mark(20, Pt(W - 80, D, STRIP.z + 3), 'Light strip', 'glows toward whoever is near');
	s += g(
		PLANE_AT_U(0, 70, 40),
		Array.from(
			{ length: 6 },
			(_, i) => `<rect class="vent" x="${i * 14}" y="0" width="8" height="34" rx="4"/>`
		).join('')
	);

	// ---- closed lids last ----
	if (flapA < 75) {
		s += flap().svg;
		if (flapA < 3) {
			// a printed sheet standing in the slot
			const px = PR.u + PR.pw / 2 - 40;
			s += g(
				PLANE_AT_W(px, exitW, H + 62),
				`<rect class="paper" width="80" height="62" stroke="none"/><rect class="hair" width="80" height="62"/>
        ${[10, 18, 26, 34, 42].map((y, i) => `<line class="paper-ink" x1="8" y1="${y}" x2="${i % 2 ? 60 : 72}" y2="${y}"/>`).join('')}`
			);
			mark(4, Pt(PR.u + PR.pw / 2, exitW, H + 40), 'Paper slot', 'in the service lid, 90 × 5');
			mark(
				17,
				Pt(lidW + INK.x + INK.bw / 2, S.strip + INK.y + INK.bd / 2, H),
				'E-ink',
				'4.2", shows the day shut'
			);
		}
	}
	if (flapA > 20)
		mark(
			4,
			Pt(
				...slab({ u0: lidW, du: W - lidW, hw: S.strip, hz: H, L: lidD, T: S.lidT, a: flapA }).p(
					lidD - 4,
					0,
					(W - lidW) / 2
				)
			),
			'Service lid',
			'lifts; carries the slot'
		);
	if (lidA < 75) s += `<g${see}>${lidSvg()}</g>` + chain();

	// ---- dimensions ----
	const ext = (a, b) =>
		`<line class="dim" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" opacity=".5"/>`;
	let dims = '';
	dims +=
		ext(Pt(0, D, 0), Pt(0, D + 44, 0)) +
		ext(Pt(W, D, 0), Pt(W, D + 44, 0)) +
		dim(Pt(0, D + 36, 0), Pt(W, D + 36, 0), `${W}`, [-14, 26]);
	dims +=
		ext(Pt(0, 0, 0), Pt(-44, 0, 0)) + dim(Pt(-36, 0, 0), Pt(-36, D, 0), `${D}`, [-10, 26], 'end');
	dims +=
		ext(Pt(W, D, H), Pt(W + 40, D, H)) +
		dim(Pt(W + 32, D, 0), Pt(W + 32, D, H), `${H}`, [10, 6], 'start');
	if (lidA > 60) {
		const top = Math.max(
			...[0, S.lidT].map(
				(tt) =>
					slab({ u0: 0, du: lidW, hw: S.strip, hz: H, L: lidD, T: S.lidT, a: lidA }).p(lidD, tt)[2]
			)
		);
		dims +=
			ext(Pt(0, -10, top), Pt(0, -60, top)) +
			dim(Pt(0, -52, 0), Pt(0, -52, top), `${Math.round(top)} open`, [-10, 6], 'end');
	}

	// ---- callouts: fixed label slots so labels hold still while a lid moves ----
	const L = 300,
		R = 1010;
	const SLOTS = {
		3: [[L, 90], 'l'],
		1: [[L, 180], 'l'],
		15: [[L, 270], 'l'],
		9: [[L, 430], 'l'],
		10: [[L, 520], 'l'],
		13: [[L, 610], 'l'],
		2: [[L, 700], 'l'],
		11: [[L, 790], 'l'],
		16: [[L, 870], 'l'],
		4: [[R, 120], 'r'],
		5: [[R, 230], 'r'],
		6: [[R, 320], 'r'],
		12: [[R, 375], 'r'],
		8: [[R, 495], 'r'],
		7: [[R, 615], 'r'],
		14: [[R, 690], 'r'],
		17: [[R, 230], 'r'],
		18: [[R, 780], 'r'],
		19: [[R, 555], 'r'],
		21: [[R, 855], 'r'],
		20: [[R, 920], 'r']
	};
	const seen = parts.filter((q) => SLOTS[q.n]).sort((a, b) => a.n - b.n);
	const calls = st.labels
		? seen.map((q) => callout(q.n, q.pt, SLOTS[q.n][0], q.name, q.fact, SLOTS[q.n][1])).join('')
		: '';
	const svg = `${svgOpen('0 0 1300 950', 'The chota box in isometric view')}${s}${dims}${calls}</svg>`;
	return { svg, callouts: seen.map(({ n, name, fact }) => ({ n, name, fact })) };
}

// convex hull (monotone chain) of screen points
function hull(pts) {
	const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
	const lo = [],
		up = [];
	for (const q of p) {
		while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
		lo.push(q);
	}
	for (const q of p.reverse()) {
		while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
		up.push(q);
	}
	return lo.slice(0, -1).concat(up.slice(0, -1));
}
