// Shared isometric kernel for the chota box drawings (from iso-figure, MIT, Tolga Cohce).
// World units = millimetres. +x runs down-right, +y runs down-left, +z up.
// Visible faces: TOP (z = const), FRONT (y = max face, lower-left), SIDE (x = max face, lower-right).
// Light comes from the upper left: TOP lightest, FRONT mid, SIDE darkest. Classes carry the tone.

export function kernel(OX = 0, OY = 0, K = 1) {
	const C = Math.cos(Math.PI / 6) * K,
		S = Math.sin(Math.PI / 6) * K;
	const f = (n) => +n.toFixed(2);
	const P = (x, y, z) => [f((x - y) * C + OX), f((x + y) * S - z * K + OY)];
	const D = (x, y, z) => [(x - y) * C, (x + y) * S - z * K];
	const plane = (O, U, V) => {
		const o = P(...O),
			u = D(...U),
			v = D(...V);
		return `matrix(${f(u[0])} ${f(u[1])} ${f(v[0])} ${f(v[1])} ${o[0]} ${o[1]})`;
	};
	const TOP = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 1, 0]);
	const FRONT = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]); // pass the face's top-left corner
	const SIDE = (x, y, z) => plane([x, y, z], [0, -1, 0], [0, 0, -1]); // pass the face's top-left corner
	// A plane tilted about the x axis: origin at its top-left, local v runs "down" the slope.
	// angleDeg = angle from horizontal; the face looks toward +y (the viewer) and up.
	const TILT = (x, y, z, angleDeg) => {
		const a = (angleDeg * Math.PI) / 180;
		return plane([x, y, z], [1, 0, 0], [0, Math.cos(a), -Math.sin(a)]);
	};
	const rect = (t, w, h, r = 0, cls = 'face') =>
		`<g transform="${t}"><rect class="${cls}" width="${f(w)}" height="${f(h)}" rx="${r}"/></g>`;
	// box: three visible faces with tone classes. cls is a material: "wood", "pcb", "brass", "dark", "paper", "plain", "acrylic"
	const box = (x, y, z, w, d, h, cls = 'plain', r = 0) =>
		rect(SIDE(x + w, y + d, z + h), d, h, Math.min(r, h / 4), `face ${cls} s`) +
		rect(FRONT(x, y + d, z + h), w, h, Math.min(r, h / 4), `face ${cls} f`) +
		rect(TOP(x, y, z + h), w, d, r, `face ${cls} t`);
	// Vertical cylinder (axis z): centre (cx, cy), base z, radius r, height h.
	const RX = (r) => r * Math.SQRT2 * Math.cos(Math.PI / 6) * K,
		RY = (r) => r * Math.SQRT2 * Math.sin(Math.PI / 6) * K;
	const cylZ = (cx, cy, z, r, h, cls = 'plain') => {
		const [bx, by] = P(cx, cy, z),
			[tx, ty] = P(cx, cy, z + h),
			rx = f(RX(r)),
			ry = f(RY(r));
		return (
			`<path class="face ${cls} f" d="M${f(bx - rx)} ${by} L${f(tx - rx)} ${ty} L${f(tx + rx)} ${ty} L${f(bx + rx)} ${by} A${rx} ${ry} 0 0 1 ${f(bx - rx)} ${by} Z"/>` +
			`<ellipse class="face ${cls} t" cx="${tx}" cy="${ty}" rx="${rx}" ry="${ry}"/>`
		);
	};
	// Circle lying on a plane: just draw <circle> inside a plane group.
	const onPlane = (t, inner) => `<g transform="${t}">${inner}</g>`;
	return { P, D, plane, TOP, FRONT, SIDE, TILT, rect, box, cylZ, onPlane, f };
}

// Callout: a terminal dot on the part (screen point), an elbow leader, and a two-line label.
// n = callout number (shown on narrow screens instead of the text; the page lists numbers under the figure).
// side: "l" | "r" — which way the text runs from the leader end.
export function callout(n, [px, py], [lx, ly], name, fact, side = 'r') {
	const anchor = side === 'r' ? 'start' : 'end';
	const dx = side === 'r' ? 6 : -6;
	const mid = [lx - (side === 'r' ? 14 : -14), ly];
	return `<g class="callout">
  <polyline class="leader" points="${px},${py} ${mid[0]},${mid[1]} ${lx},${ly}"/>
  <circle class="tip" cx="${px}" cy="${py}" r="2.6"/>
  <circle class="num-bg" cx="${lx}" cy="${ly}" r="13"/><text class="num" x="${lx}" y="${ly + 5}" text-anchor="middle">${n}</text>
  <text class="lbl" x="${lx + dx + (side === 'r' ? 10 : -10)}" y="${ly - 2}" text-anchor="${anchor}">${name}</text>
  <text class="lbl-fact" x="${lx + dx + (side === 'r' ? 10 : -10)}" y="${ly + 19}" text-anchor="${anchor}">${fact}</text>
</g>`;
}

export const svgOpen = (vb, label) =>
	`<svg class="iso" viewBox="${vb}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">`;

// Box-coordinate frame, so the object's front faces the lower-right (SIDE) and its left end the lower-left (FRONT).
// u = mm from the object's LEFT end (0..W), w = mm from its BACK (0..Dp), z = mm up. World: x = w, y = W - u.
// Paint order: larger u first and smaller w first (right and back first), lower z first.
export function frame(K, W, Dp) {
	const Pt = (u, w, z) => K.P(w, W - u, z);
	// Planes; draw in local units: x to the right as seen from the front, y "down" as named.
	const BTOP = (u, w, z) => K.plane([w, W - u, z], [0, -1, 0], [1, 0, 0]); // origin = back-left corner; local y runs toward the front
	const BFRONT = (u, z) => K.plane([Dp, W - u, z], [0, -1, 0], [0, 0, -1]); // object's front face (w = Dp); origin top-left; local y runs down
	const BLEFT = (w, z) => K.plane([w, W, z], [1, 0, 0], [0, 0, -1]); // object's left end (u = 0); local x runs back -> front
	const PLANE_AT_W = (u, w, z) => K.plane([w, W - u, z], [0, -1, 0], [0, 0, -1]); // any face looking to the front at depth w
	const PLANE_AT_U = (u, w, z) => K.plane([w, W - u, z], [1, 0, 0], [0, 0, -1]); // any face looking to the left at width u
	// A face tilted back from vertical, looking to the front and up; angleDeg from horizontal (70 = leans back 20 deg).
	// Origin is its TOP-LEFT corner (u, w, z of the top edge); local y runs down the slope toward the front/bottom.
	const BTILT = (u, w, z, angleDeg) => {
		const a = (angleDeg * Math.PI) / 180;
		return K.plane([w, W - u, z], [0, -1, 0], [Math.cos(a), 0, -Math.sin(a)]);
	};
	// box in object coords: from (u, w, z), size du (width), dw (depth), h (height)
	const bbox = (u, w, z, du, dw, h, cls = 'plain', r = 0) =>
		K.box(w, W - u - du, z, dw, du, h, cls, r);
	const bcyl = (u, w, z, r, h, cls = 'plain') => K.cylZ(w, W - u, z, r, h, cls);
	return { Pt, BTOP, BFRONT, BLEFT, BTILT, PLANE_AT_W, PLANE_AT_U, bbox, bcyl };
}

// Dimension line between two screen points, ticks at both ends, label at the midpoint (screen units).
// off = [dx, dy] to nudge the label; anchor = "middle" | "start" | "end".
export function dim([ax, ay], [bx, by], label, off = [0, -8], anchor = 'middle') {
	const dx = bx - ax,
		dy = by - ay,
		L = Math.hypot(dx, dy) || 1,
		nx = (-dy / L) * 6,
		ny = (dx / L) * 6;
	const r = (n) => +n.toFixed(2);
	return (
		`<g class="dimension"><line class="dim" x1="${r(ax)}" y1="${r(ay)}" x2="${r(bx)}" y2="${r(by)}"/>` +
		`<line class="dim" x1="${r(ax - nx)}" y1="${r(ay - ny)}" x2="${r(ax + nx)}" y2="${r(ay + ny)}"/>` +
		`<line class="dim" x1="${r(bx - nx)}" y1="${r(by - ny)}" x2="${r(bx + nx)}" y2="${r(by + ny)}"/>` +
		`<text class="dim-text" x="${r((ax + bx) / 2 + off[0])}" y="${r((ay + by) / 2 + off[1])}" text-anchor="${anchor}">${label}</text></g>`
	);
}
