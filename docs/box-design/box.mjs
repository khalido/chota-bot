// Fig 1 v2: the compact chota box, drawn at runtime so the lids can open.
// renderBox(state) -> { svg, callouts }. Pure string building; imports only common.mjs.
import { kernel, frame, callout, svgOpen, dim } from './common.mjs';

// ---- sizes (mm). Change a measured number here; the drawing and the cut list follow. ----
export const S = {
	t: 12, // wall and base thickness (birch ply)
	lidT: 20, // lid and service-lid depth: 14 mm frame strips on edge + 6 mm ply skin
	screen: [194, 119], // Waveshare 8" DSI LCD (C), from Waveshare's dimension drawing
	lip: 3, // hardwood left round the glass: the glass sits flush in a 9 mm rebate, a hairline gap all round
	band: 50, // least plain band under the screen; the printer's depth usually makes it longer
	driver: 64, // SB Acoustics SB65WBAC25-4, 64 mm square frame (retailer), mounted from inside; the 56 mm cut-out is assumed: check the datasheet
	cut: 56,
	strip: 30, // fixed hinge strip along the back; concealed barrel hinges let it be narrow
	printer: { pw: 140, pd: 175, ph: 130 }, // MUNBYN ITPP098P, measured 18 Oct 2026 (depth "about")
	cableGap: 25, // behind the printer for its USB and power plugs: right-angle plugs (40 with straight ones)
	frontGap: 15, // in front of the printer: the knob, buttons and radar behind the bay front
	side: 2, // printer to the end wall and to the deck frame
	deckGap: 34, // deck top to the lid's inner face (knobs are 20, toggles 18)
	deck: 9
};
const t = S.t;
const lidW = S.screen[0] + 2 * S.lip; // 203
const bayU = lidW; // no divider: the bay starts at the lid seam
const bayIn = S.printer.pw + 2 * S.side; // 144
export const W = Math.round(lidW + bayIn + t); // 356
// depth: the larger of what the lid needs and what the printer needs
export const D = Math.max(
	S.strip + S.screen[1] + 2 * S.lip + S.band,
	t + S.cableGap + S.printer.pd + S.frontGap + t
); // 239
const lidD = D - S.strip; // 209
const RIM = t + S.printer.ph + 3; // wall tops: printer + 3 mm clearance = 145
export const H = RIM + S.lidT; // 165
const DECK = RIM - S.deckGap; // deck top, 111
const PR = { u: bayU + S.side, w: t + S.cableGap, z: t, ...S.printer };
const exitW = PR.w + PR.pd - 10; // paper leaves ~10 mm behind the printer's front
const POST = 15; // the deck frame: a 15 × 15 hardwood post at the back and a rail under the deck's right edge
const CH_W = lidW - 2 * t; // chamber: left end to its own 12 mm end panel, which is the deck frame's front post
const CH_D = 72; // chamber depth: the deck behind it keeps ~125 mm clear for deep controls
const PLENUM = 4; // strips on the chamber top: the camera ribbon and mic lead run over it
const CH_H = DECK - S.deck - PLENUM - t - 6; // chamber inside height, 80
const SPK = [50, 150]; // speaker centres: a pair, now the face lives on the bay front
const SPK_Z = 54; // frame clears the base; cut-out stays under the chamber top
const MIC_U = 100,
	MIC_Z = RIM - 17; // ReSpeaker Lite flat behind the front rim, above the deck: two pinholes, centred over the speakers
const svcW = W - lidW;
const INK = { bw: 103, bd: 78.5, aw: 84.8, ad: 63.6, y: 28 }; // Waveshare 4.2" e-ink: board and active area, on the service lid (y from the hinge)
INK.x = (svcW - INK.bw) / 2;
const OLED = [
	// [u, w, window w, window d, text]: amber OLEDs behind smoked acrylic, run by the Pico
	[40, 42, 30, 15, 'KID2'],
	[166, 42, 30, 15, 'WEEKEND'],
	[118, 126, 56, 28, 'LISTENING…'] // 2.42" status
];
const KNOBS = [
	[40, 80],
	[166, 80]
];
const PRINT_AT = [170, 128]; // its Ø24 body stays clear of the deck rail
// The front is two panels, split by a 3 mm groove under the lid seam: the speakers on the left; on the right, over the
// printer, one smoked-acrylic "eye" with the face (GlowBit 8×8, 61 mm, WS2812B), the LD2450 radar and the camera behind
// it, and a row of controls under it: knob, TALK, three small buttons. All of it lives in the 15 mm in front of the printer.
const PANEL_C = (lidW + W) / 2; // centre of the right panel
const EYE = { u: PANEL_C, z: 100, w: 120, h: 70, r: 8 };
const FACE = { u: EYE.u - EYE.w / 2 + 8 + 61 / 2, z: EYE.z, board: 61, n: 8 };
const RADAR = { u: EYE.u + 34, z: EYE.z + 15 }; // 44 × 15 board: acrylic, never metal, in front of a 24 GHz radar
const CAM = { u: EYE.u + 34, z: EYE.z - 14 }; // lens behind a clear Ø8 hole in the acrylic, brass slide over it
const CTRL_Z = 40,
	KNOB_U = PANEL_C - 43,
	TALK_U = PANEL_C - 9,
	BTN_U = [PANEL_C + 21, PANEL_C + 35, PANEL_C + 49];
export const PLINTH = { h: 12, in: 10 }; // a dark plinth set 10 mm in under the base: the box floats; the light strip hides in it
export const OPEN_AT = 110; // lid rotation: 70 deg from flat, leaning back

/** Air inside the speaker chamber, litres, before the drivers and wool take their share. */
export const chamberL = () => +((CH_W * CH_H * (CH_D - 6)) / 1e6).toFixed(1);

// ---- cut list, from the same numbers ----
export function cutList() {
	const inner = D - 2 * t,
		gap = 1;
	return [
		{
			part: 'Base',
			qty: 1,
			size: [W, D, t],
			mat: '12 mm birch ply',
			note: 'sits on the plinth; 3 mm roundover on every outside edge of the box, walls and lids included'
		},
		{
			part: 'Plinth, front and back',
			qty: 2,
			size: [W - 2 * PLINTH.in, PLINTH.h, t],
			mat: 'hardwood, painted black',
			note: `set ${PLINTH.in} mm in from every edge, so the box casts a shadow line and looks lifted. The light strip runs along the front piece's face, under the overhang, and washes the bench`
		},
		{
			part: 'Plinth, ends',
			qty: 2,
			size: [D - 2 * PLINTH.in - 2 * t, PLINTH.h, t],
			mat: 'hardwood, painted black',
			note: 'between front and back; felt pads under the corners'
		},
		{
			part: 'Front and back walls',
			qty: 2,
			size: [W, RIM - t, t],
			mat: '12 mm birch ply',
			note: `front: a 3 × 2 groove at u ${lidW}, under the lid seam, top to bottom, so the front reads as two panels. Left panel: two ${S.cut} mm holes (cut-out assumed: check the datasheet), the SB65s screwed on from inside, the holes chamfered 45° at the back; a Ø${S.cut + 10} × 2 rebate in front of each for a black mesh disc; two Ø1.5 mic pinholes and a Ø3 LED above. Right panel: one ${EYE.w} × ${EYE.h} window, ${EYE.r} mm corners, rebated 3 mm from inside for smoked acrylic (a clear Ø8 spot for the camera); under it Ø7 knob, Ø19 TALK and three Ø7 button holes, each counterbored from inside so the parts sit inside the 15 mm in front of the printer. Back: Ø22 for the Pi lead at the left, Ø16 for the 24 V lead at the right, a field of Ø4 holes high in the left zone and across the bay. Cut before glue-up`
		},
		{
			part: 'Ends',
			qty: 2,
			size: [inner, RIM - t, t],
			mat: '12 mm birch ply',
			note: 'between front and back; a 7 × 5 field of Ø4 holes at 10 mm pitch low on the left, and one on the right beside the printer, black mesh behind'
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
			size: [CH_W, CH_H, 6],
			mat: '6 mm ply',
			note: `the base, front wall, left end and the chamber end are its other sides; ~${chamberL()} L inside, shared by the two SB65s; glue + silicone every seam, wool inside`
		},
		{
			part: 'Speaker chamber, end',
			qty: 1,
			size: [CH_D, CH_H + 6, t],
			mat: '12 mm birch ply',
			note: "at the lid seam: closes the chamber and is the deck frame's front post. The bay front's wires cross over its top, in the plenum under the deck"
		},
		{
			part: 'Speaker chamber, top',
			qty: 1,
			size: [CH_W, CH_D, 6],
			mat: '6 mm ply',
			note: `the front of the deck rests on ${PLENUM} mm strips along it; the gap carries the camera ribbon and mic lead`
		},
		{
			part: 'Deck',
			qty: 1,
			size: [lidW - t - gap, D - t - S.strip - gap, S.deck],
			mat: '9 mm birch ply',
			note: `lifts out with its wiring; nothing deep over the speaker chamber (front ${CH_D} mm); three OLED windows (36 × 21 behind each dial, 62 × 34 by PRINT) under smoked acrylic; 30 × 10 slot at the front-left corner for the ribbon and mic lead; notch the front edge 90 × 3 if the mic board needs it`
		},
		{
			part: 'Deck cleat',
			qty: 1,
			size: [inner - CH_D, 12, 12],
			mat: 'pine',
			note: `on the left end, top ${DECK - S.deck - t} mm above the base`
		},
		{
			part: 'Deck frame: post and rail',
			qty: 2,
			size: [D - 2 * t - CH_D, POST, POST],
			mat: 'hardwood',
			note: `no divider: a post (cut to ${DECK - S.deck - POST - t} mm) at the back under the rail, and the rail under the deck's right edge from the post to the chamber end. The printer sits ${S.side} mm clear of it, and the lids' inner edges rest on the front wall and hinge strip only (stiff torsion boxes, magnet catches)`
		},
		{
			part: 'Printer locating blocks',
			qty: 4,
			size: [40, 15, 10],
			mat: 'hardwood offcut',
			note: `glued to the base round the printer's feet, ${S.side} mm clear, so the paper always lines up with the slot`
		},
		{
			part: 'Lid frame, front',
			qty: 1,
			size: [lidW - gap, S.lidT - 6, t],
			mat: 'hardwood',
			note: `${t - S.lip} mm rebate for the screen glass, all four rails: the glass sits flush with the wood, a hairline gap all round, no lip over its edge`
		},
		{
			part: 'Lid frame, back',
			qty: 1,
			size: [lidW - gap, S.lidT - 6, 20],
			mat: 'hardwood',
			note: 'barrel hinges and the chain go into this, never the ply'
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
			note: 'barrel hinges go into this'
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
		item: 'Barrel hinges, 10 mm',
		qty: 4,
		note: 'two per lid, drilled into the lid back rails and the hinge strip: nothing shows when shut'
	},
	{
		item: 'Brass chain, about 150 mm',
		qty: 2,
		note: 'on screw eyes in hardwood; stops the lid 20° past upright'
	},
	{
		item: 'Black steel mesh',
		qty: '1 small sheet',
		note: `two Ø${S.cut + 10} speaker discs and the vents; the cones sit 12 mm back, so no rattle. Brass is kept for what you touch`
	},
	{
		item: 'Brass slide for the camera shutter',
		qty: 1,
		note: 'over the clear spot in the eye window'
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
		item: 'Felt pads',
		qty: 4,
		note: `under the plinth; ${H + PLINTH.h} mm tall overall`
	},
	{
		item: 'Closed-cell foam, 1–2 mm',
		qty: '1 sheet',
		note: 'gaskets: mic board, screen clips, driver frames'
	},
	{
		item: 'Aluminium LED channel with diffuser, 10 mm',
		qty: 1,
		note: `on the plinth's front, ${W - 2 * PLINTH.in - 20} mm long, holding the light strip`
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
	s += bbox(PLINTH.in, PLINTH.in, -PLINTH.h, W - 2 * PLINTH.in, D - 2 * PLINTH.in, PLINTH.h, 'dark'); // plinth
	s += bbox(0, 0, 0, W, D, t, 'wood'); // base
	s += bbox(0, 0, t, W, t, RIM - t, 'wood'); // back wall
	s += bbox(W - t, t, t, t, D - 2 * t, RIM - t, 'wood'); // right end (inner face shows)
	s += bbox(0, t, t, t, S.strip - t, RIM - t, 'wood'); // left end under the strip
	s += bbox(0, 0, RIM, W, S.strip, S.lidT, 'wood'); // hinge strip: barrel hinges, nothing shows

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
				[lidW - POST, P.w - 30, P.z + 4]
			],
			'cable'
		);
	}

	// ---- deck frame instead of a divider: post at the back, rail under the deck's edge, chamber end at the front ----
	s +=
		bbox(lidW - POST, S.strip, t, POST, POST, DECK - S.deck - POST - t, 'wood') +
		bbox(lidW - POST, S.strip, DECK - S.deck - POST, POST, D - t - CH_D - S.strip, POST, 'wood') +
		bbox(lidW - t, D - t - CH_D, t, t, CH_D, CH_H + 6, 'wood');

	// ---- the lid (screen + speakers) ----
	const lidA = st.lid;
	const [sw, sh] = S.screen,
		lp = S.lip;
	const lidInner = `
    <rect class="glass" x="${lp}" y="${lp}" width="${sw}" height="${sh}" rx="2"/>
    <rect class="screen-on" x="${lp + 9}" y="${lp + 12}" width="${sw - 18}" height="${sh - 24}"/>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + sh * 0.55}" text-anchor="middle" font-size="${Math.round(sh * 0.32)}">06:52</text>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + sh * 0.72}" text-anchor="middle" font-size="9" opacity=".8">the literary clock</text>
    <text class="screen-text" x="${lp + sw / 2}" y="${lp + sh * 0.84}" text-anchor="middle" font-size="7" opacity=".6">dims at 9 pm, off at night</text>
    <text class="face-text" x="${lidW / 2}" y="${lp + sh + 30}" text-anchor="middle" font-size="10" font-weight="600" letter-spacing="3">CHOTA</text>`;
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
			mark(1, Pt(...L0.p(lidD * 0.55, S.lidT, lidW * 0.3)), 'Lid screen', '8" glass, flush in the wood');
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
		s += bbox(t, D - t - CH_D, t, CH_W, CH_D, CH_H + 6, 'dark', 3);
		// amp on the floor at the left, USB sound card in front of it, Pico beside the Pi
		s += bbox(16, 20, t, 58, 95, 3, 'pcb', 2) + bbox(28, 40, t + 3, 34, 30, 22, 'dark');
		mark(13, Pt(45, 70, t + 3), 'Amp', 'TPA3116, 24 V');
		s += bbox(18, 128, t, 45, 20, 12, 'plain', 3);
		s += bbox(MIC_U - 43, D - t - 3, MIC_Z - 16, 86, 2, 32, 'pcb'); // ReSpeaker Lite
		// Pico under the deck, clear of the meter and the dial pots
		s += bbox(95, 128, t, 51, 21, 1.2, 'pcb');
		mark(14, Pt(120, 138, t + 1), 'Pico 2 WH', 'on the floor');
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
		// the eye's boards in the 15 mm in front of the printer: face, radar, camera
		s +=
			bbox(
				FACE.u - FACE.board / 2,
				D - t - 4,
				FACE.z - FACE.board / 2,
				FACE.board,
				3,
				FACE.board,
				'pcb'
			) +
			bbox(RADAR.u - 22, D - t - 4, RADAR.z - 7, 44, 3, 15, 'pcb') +
			bbox(CAM.u - 12, D - t - 10, CAM.z - 12, 25, 9, 24, 'pcb');
		// camera ribbon and the face, radar and controls leads: over the chamber in the plenum, across its end, down the bay front
		s += path3(
			[
				[154, 72, t + 10],
				[150, D - t - CH_D - 6, DECK - S.deck - 2],
				[lidW - 6, D - t - 30, DECK - S.deck - 2],
				[lidW + 14, D - t - 8, DECK - S.deck - 6],
				[CAM.u, D - t - 10, CAM.z + 12]
			],
			'ffc'
		);
		s += path3(
			[
				[172, 76, t + 10],
				[160, D - t - CH_D - 10, DECK - S.deck - 2],
				[lidW - 4, D - t - 20, DECK - S.deck - 2],
				[lidW + 8, D - t - 6, DECK - S.deck - 10],
				[FACE.u - 20, D - t - 5, FACE.z + FACE.board / 2]
			],
			'cable'
		);
		// the 24 V lead from the back right to the printer and, across the floor, the amp
		s += path3(
			[
				[W - 50, 0, 40],
				[W - 50, t + 16, 20],
				[lidW, 30, t + 4],
				[74, 40, t + 4]
			],
			'cable'
		);
	}
	s +=
		`<g${see}>` +
		bbox(t, S.strip, DECK - S.deck, lidW - t, D - t - S.strip, S.deck, 'wood') +
		`</g>`;
	// deck controls
	let dk = '';
	// analog needle meter where the deck screen was: minutes to the bus, today's max
	dk += bbox(66, 38, DECK, 80, 52, 4, 'brass', 6);
	dk += g(
		BTOP(70, 42, DECK + 4),
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
	for (const [u, w] of KNOBS) {
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
	[75, 92, 109, 126, 143].forEach((u, i) => {
		dk +=
			bcyl(u, 100, DECK, 5, 3, 'dark') +
			circTop(u, 100, DECK + 3, 4, i === 1 || i === 3 ? 'led on' : 'led');
	});
	// toggles and the covered toggle
	for (const u of [22, 38, 54]) {
		dk += bcyl(u, 128, DECK, 6, 2, 'brass') + rod(Pt(u, 128, DECK + 2), Pt(u, 122, DECK + 18), 3.2);
	}
	dk +=
		bcyl(74, 128, DECK, 7, 2, 'brass') +
		rod(Pt(74, 128, DECK + 2), Pt(74, 122, DECK + 16), 4) +
		bbox(66, 110, DECK, 16, 34, 9, 'brass', 2);
	// amber OLEDs: what each dial is set to, and what chota is doing
	for (const [u, w, ow, od, txt] of OLED)
		dk += g(
			BTOP(u - ow / 2 - 3, w - od / 2 - 3, DECK),
			`<rect class="glass" width="${ow + 6}" height="${od + 6}" rx="2"/><rect class="screen-on" x="3" y="3" width="${ow}" height="${od}"/><text class="screen-text" x="${3 + ow / 2}" y="${3 + od / 2 + 2.5}" text-anchor="middle" font-size="7">${txt}</text>`
		);
	// PRINT
	dk +=
		bcyl(...PRINT_AT, DECK, 18, 3, 'brass') +
		bcyl(...PRINT_AT, DECK + 3, 15, 8, 'accent') +
		circTop(...PRINT_AT, DECK + 11, 9, 'accent-hi');
	s += `<g${see}>${dk}</g>`;
	if (lidA > 60) {
		mark(7, Pt(...PRINT_AT, DECK + 11), 'PRINT', '30 mm red arcade');
		mark(8, Pt(106, 64, DECK + 4), 'Needle meter', 'minutes to the bus');
		mark(9, Pt(...KNOBS[1], DECK + 20), 'WHO + WHAT', 'two dials, wooden knobs');
		mark(10, Pt(54, 122, DECK + 16), 'Toggles', '3 mini + 1 covered');
		mark(18, Pt(OLED[2][0], OLED[2][1], DECK), 'OLEDs', '3 amber: dials + status');
	}

	// ---- walls in front ----
	s +=
		`<g${see}>` +
		bbox(0, S.strip, t, t, D - t - S.strip, RIM - t, 'wood') +
		bbox(0, D - t, t, W, t, RIM - t, 'wood') +
		`</g>`;
	// front: the seam groove; speakers and mic on the left panel; the eye and its controls on the right; left-end vents
	s += g(PLANE_AT_W(lidW - 1.5, D, RIM), `<rect class="cut-fill" width="3" height="${RIM}"/>`);
	const holes = (r) =>
		Array.from({ length: 80 }, (_, i) => {
			const rr = 3 + Math.floor(i / 8) * 3,
				th = i * 2.4;
			return rr < r - 1
				? `<circle class="face wood s" cx="${f1(rr * Math.cos(th))}" cy="${f1(rr * Math.sin(th))}" r=".7" opacity=".5"/>`
				: '';
		}).join('');
	const R0 = (S.cut + 10) / 2;
	for (const u of SPK)
		s += g(
			PLANE_AT_W(u, D, SPK_Z),
			`<circle class="face dark f" r="${R0}"/><circle class="hair" r="${R0 - 2}"/>${holes(R0 - 2)}`
		);
	mark(2, Pt(SPK[0], D, SPK_Z), 'Speakers', `SB65 ×2, ${chamberL()} L shared`);
	s += g(
		PLANE_AT_W(MIC_U, D, MIC_Z),
		`${[-20, 20].map((x) => `<circle class="face dark f" cx="${x}" r="1.6"/>`).join('')}<circle class="led on" r="1.8"/>`
	);
	mark(11, Pt(MIC_U - 20, D, MIC_Z), 'Mic', 'two pinholes, ReSpeaker Lite');
	// the eye: one smoked window holding the face (8×8, two eyes and a mouth), the radar and the camera
	const pitch = FACE.board / FACE.n;
	const lit = (r, c) =>
		((r === 2 || r === 3) && (c === 2 || c === 5)) || (r === 5 && c > 1 && c < 6);
	const ex = EYE.u - EYE.w / 2,
		fx = FACE.u - FACE.board / 2 - ex,
		fy = EYE.h / 2 - FACE.board / 2;
	s += g(
		PLANE_AT_W(ex, D, EYE.z + EYE.h / 2),
		`<rect class="glass" width="${EYE.w}" height="${EYE.h}" rx="${EYE.r}"/>${Array.from(
			{ length: FACE.n * FACE.n },
			(_, i) => {
				const r = Math.floor(i / FACE.n),
					c = i % FACE.n,
					x = fx + pitch * (c + 0.5),
					y = fy + pitch * (r + 0.5);
				return lit(r, c)
					? `<circle class="halo" cx="${f1(x)}" cy="${f1(y)}" r="${f1(pitch * 0.6)}"/><rect class="led on" x="${f1(x - 2.2)}" y="${f1(y - 2.2)}" width="4.4" height="4.4" rx="1"/>`
					: `<rect class="led" x="${f1(x - 2.2)}" y="${f1(y - 2.2)}" width="4.4" height="4.4" rx="1" opacity=".25"/>`;
			}
		).join(
			''
		)}<circle class="face dark s" cx="${CAM.u - ex}" cy="${EYE.z + EYE.h / 2 - CAM.z}" r="4"/><circle class="glass" cx="${CAM.u - ex}" cy="${EYE.z + EYE.h / 2 - CAM.z}" r="2"/><rect class="face brass t" x="${CAM.u - ex + 6}" y="${EYE.z + EYE.h / 2 - CAM.z - 5}" width="8" height="10" rx="2"/>`
	);
	mark(19, Pt(FACE.u, D, FACE.z), 'Eye', 'face, radar, camera');
	s += g(
		PLANE_AT_W(KNOB_U, D, CTRL_Z),
		`<circle class="face brass f" r="11"/><circle class="face brass t" r="8"/><line class="detail" x1="0" y1="0" x2="0" y2="-7" stroke-width="1.6"/>`
	);
	s += g(
		PLANE_AT_W(TALK_U, D, CTRL_Z),
		`<circle class="face brass f" r="11"/><circle class="face brass t" r="8"/><circle class="led on" r="2"/>`
	);
	for (const u of BTN_U)
		s += g(
			PLANE_AT_W(u, D, CTRL_Z),
			`<circle class="face brass f" r="5.5"/><circle class="face brass t" r="3.6"/>`
		);
	mark(21, Pt(TALK_U, D, CTRL_Z), 'Knob, TALK, 3 buttons', 'in one row under the eye');
	// light strip on the plinth's front, under the overhang: it washes the bench toward whoever is near
	const nLed = Math.floor((W - 2 * PLINTH.in - 20) / 16.7);
	s += g(
		PLANE_AT_W(PLINTH.in + 10, D - PLINTH.in, -2),
		`<rect class="face dark f" width="${W - 2 * PLINTH.in - 20}" height="6" rx="1"/>${Array.from(
			{ length: nLed },
			(_, i) => {
				const x = 8 + i * 16.7,
					on = Math.abs(i - (nLed - 5)) < 3;
				return `${on ? `<ellipse class="halo" cx="${f1(x)}" cy="9" rx="12" ry="6"/>` : ''}<rect class="led${on ? ' on' : ''}" x="${f1(x - 1.5)}" y="1.5" width="3" height="3"/>`;
			}
		).join('')}`
	);
	mark(20, Pt(W - 80, D - PLINTH.in, -6), 'Light strip', 'in the plinth');
	s += g(
		PLANE_AT_U(0, 70, 50),
		Array.from({ length: 35 }, (_, i) => `<circle class="vent" cx="${(i % 7) * 10}" cy="${Math.floor(i / 7) * 10}" r="2"/>`).join('')
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
		dim(Pt(W + 32, D, -PLINTH.h), Pt(W + 32, D, H), `${H + PLINTH.h}`, [10, 6], 'start');
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
		9: [[L, 430], 'l'],
		10: [[L, 520], 'l'],
		13: [[L, 610], 'l'],
		2: [[L, 700], 'l'],
		11: [[L, 790], 'l'],
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
