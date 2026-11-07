// The arranger: drag parts on the straight-on view, set how deep each sinks, read the cut list.
// board.mjs is inlined before this file by build-board.mjs.
(() => {
	const SNAP = 5;
	const KEEP_BEHIND = 4; // wood left behind a pocket before it counts as cut through
	const STORE = 'chota-board-v1';
	const el = (id) => document.getElementById(id);
	const snap = (n) => Math.round(n / SNAP) * SNAP;
	const fresh = (l) => ({ id: l.id, w: l.w, h: l.h, t: l.t ?? 12, gap: gapOf(l), grid: l.grid ?? '', wires: l.wires, items: itemsOf(l).map((i) => ({ ...i })) });
	const visible = () => st.items.filter((i) => !i.hidden);
	const stickOut = (i) => SPECS[i.kind].out - (i.sink ?? 0);

	let st = fresh(LAYOUTS[0]);
	let sel = null;
	let drag = null;
	let view3d = null;
	try {
		const saved = JSON.parse(localStorage.getItem(STORE));
		if (saved?.items) st = { ...saved, items: saved.items.filter((i) => SPECS[i.kind]) };
	} catch {}

	const touches = (p, q) => p.u0 < q.u1 && q.u0 < p.u1 && p.z0 < q.z1 && q.z0 < p.z1;

	function problems() {
		const out = [];
		const vis = visible();
		vis.forEach((a, n) => {
			const p = a.sink ? pocketOf(a) : boundsOf(a);
			if (p.u0 < 0 || p.z0 < 0 || p.u1 > st.w || p.z1 > st.h) out.push(`${SPECS[a.kind].name} runs off the board`);
			vis.slice(n + 1).forEach((c) => {
				const q = c.sink ? pocketOf(c) : boundsOf(c);
				if (touches(p, q)) out.push(`${SPECS[a.kind].name} overlaps ${SPECS[c.kind].name}`);
			});
			plugZonesOf(a).forEach((z) =>
				vis.filter((c) => c !== a && touches(z, boundsOf(c))).forEach((c) => out.push(`${SPECS[c.kind].name} blocks the ${SPECS[a.kind].name} plugs`))
			);
		});
		return out;
	}

	function cutRows() {
		return visible()
			.filter((i) => i.sink)
			.map((i) => {
				const p = pocketOf(i);
				const through = i.sink > st.t - KEEP_BEHIND;
				return `<tr><td>${SPECS[i.kind].name}</td><td>${p.u1 - p.u0} × ${p.z1 - p.z0}</td><td>${through ? `Through, floor ${i.sink} mm back` : `${i.sink} deep`}</td></tr>`;
			})
			.join('');
	}

	// The popover for the selected part, opened beside where it was tapped. On a phone CSS turns it into a bottom sheet.
	function panel(x, y) {
		const pop = el('part');
		const it = st.items.find((i) => i.id === sel);
		if (!it) {
			pop.hidden = true;
			return;
		}
		const sp = SPECS[it.kind];
		const size = sp.r !== undefined ? `Ø ${sp.r * 2}` : `${sp.du} × ${sp.dz}`;
		pop.innerHTML = `<button id="close" aria-label="Close">×</button><h3>${sp.name}</h3><p>${sp.does ?? ''}</p><p class="small">${size} mm. <span id="sink-out"></span></p><label>Sink into the board: <b id="sink-val"></b><input id="sink" type="range" min="0" max="${sp.out}" value="${it.sink ?? 0}"></label><p class="small">${sp.source}</p><button id="remove">Remove this part</button>`;
		const facts = () => {
			el('sink-val').textContent = `${it.sink ?? 0} mm`;
			el('sink-out').textContent = `Sticks out ${stickOut(it)} mm from the face, ${stickOut(it) + st.t + gapOf(st)} mm from the wall.`;
		};
		facts();
		el('sink').addEventListener('input', (e) => {
			it.sink = +e.target.value;
			facts();
			draw();
		});
		el('close').addEventListener('click', () => {
			sel = null;
			panel();
			draw();
		});
		el('remove').addEventListener('click', () => {
			st.items = st.items.filter((i) => i !== it);
			sel = null;
			partList();
			panel();
			draw();
		});
		pop.hidden = false;
		if (x !== undefined) {
			const r = pop.getBoundingClientRect();
			pop.style.left = `${Math.max(12, Math.min(x + 14, innerWidth - r.width - 12))}px`;
			pop.style.top = `${Math.max(12, Math.min(y + 14, innerHeight - r.height - 12))}px`;
		}
	}

	function partList() {
		const seen = {};
		el('parts').innerHTML = st.items
			.map((i) => {
				seen[i.kind] = (seen[i.kind] ?? 0) + 1;
				return `<label><input type="checkbox" data-id="${i.id}" ${i.hidden ? '' : 'checked'}> ${SPECS[i.kind].name}${seen[i.kind] > 1 ? ` (${seen[i.kind]})` : ''}</label>`;
			})
			.join('');
	}

	function draw() {
		el('front').innerHTML = renderBoard(st, 'front', sel).svg;
		if (view3d) view3d.update(st, sel);
		else el('fallback').innerHTML = renderBoard(st).svg;
		const vis = visible();
		const wallGap = st.t + gapOf(st);
		const rows = [...vis].sort((a, b) => stickOut(b) - stickOut(a));
		const seen = new Set();
		const top = rows[0];
		el('stats').textContent = top ? `Board ${st.w / 10} × ${st.h / 10} cm, ${st.t} mm thick. Furthest out: ${SPECS[top.kind].name}, ${stickOut(top)} mm from the face, ${stickOut(top) + wallGap} mm from the wall.` : '';
		el('jut').innerHTML = `<tr><th>Part</th><th>From face</th><th>From wall</th></tr>${rows
			.filter((i) => !seen.has(`${i.kind}${i.sink ?? 0}`) && seen.add(`${i.kind}${i.sink ?? 0}`))
			.map((i) => `<tr><td>${SPECS[i.kind].name}</td><td>${stickOut(i)}</td><td>${stickOut(i) + wallGap}</td></tr>`)
			.join('')}`;
		const bad = problems();
		el('warn').innerHTML = bad.map((b) => `<li>${b}</li>`).join('');
		el('warn').hidden = !bad.length;
		const cuts = cutRows();
		el('cuts').innerHTML = cuts ? `<table><tr><th>Part</th><th>Hole, mm</th><th>Depth</th></tr>${cuts}</table>` : '<p>No holes to cut.</p>';
		try {
			localStorage.setItem(STORE, JSON.stringify(st));
		} catch {}
	}

	const note = () => {
		el('note').textContent = LAYOUTS.find((l) => l.id === st.id)?.note ?? '';
	};

	const syncBoard = () => {
		el('bw').value = st.w;
		el('bh').value = st.h;
		el('bt').value = st.t;
		el('bg').value = gapOf(st);
		el('solid').value = st.solid ?? 70;
		el('grid').value = st.grid ?? '';
	};

	function toMm(e) {
		const svg = el('front').querySelector('svg');
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
		const lift = RELIEF * (gapOf(st) + st.t);
		return { u: p.x - FRONT_ORIGIN - lift, z: st.h + 50 - p.y + lift };
	}

	function hit(m) {
		const area = (b) => (b.u1 - b.u0) * (b.z1 - b.z0);
		return visible()
			.filter((i) => {
				const b = boundsOf(i);
				return m.u >= b.u0 && m.u <= b.u1 && m.z >= b.z0 && m.z <= b.z1;
			})
			.sort((a, b) => area(boundsOf(a)) - area(boundsOf(b)))[0];
	}

	const front = el('front');
	front.addEventListener('pointerdown', (e) => {
		const m = toMm(e);
		const it = hit(m);
		sel = it?.id ?? null;
		el('part').hidden = true;
		if (it) {
			drag = { it, du: m.u - it.u, dz: m.z - it.z, x: e.clientX, y: e.clientY };
			front.setPointerCapture(e.pointerId);
		}
		draw();
	});
	front.addEventListener('pointermove', (e) => {
		if (!drag) return;
		const m = toMm(e);
		drag.it.u = snap(m.u - drag.du);
		drag.it.z = snap(m.z - drag.dz);
		draw();
	});
	front.addEventListener('pointerup', (e) => {
		if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) panel(e.clientX, e.clientY);
		drag = null;
	});
	front.addEventListener('pointercancel', () => (drag = null));

	el('preset').innerHTML = LAYOUTS.map((l, n) => `<option value="${n}">${l.title}</option>`).join('');
	el('preset').value = Math.max(0, LAYOUTS.findIndex((l) => l.id === st.id));
	el('preset').addEventListener('change', (e) => {
		st = fresh(LAYOUTS[+e.target.value]);
		sel = null;
		note();
		syncBoard();
		partList();
		panel();
		draw();
	});
	[['bw', 'w'], ['bh', 'h'], ['bt', 't'], ['bg', 'gap']].forEach(([id, key]) =>
		el(id).addEventListener('change', (e) => {
			const n = +e.target.value;
			if (n > 0) st[key] = n;
			else e.target.value = st[key];
			draw();
		})
	);
	el('parts').addEventListener('change', (e) => {
		const it = st.items.find((i) => i.id === e.target.dataset.id);
		if (!it) return;
		it.hidden = !e.target.checked;
		if (it.hidden && sel === it.id) sel = null;
		panel();
		draw();
	});
	el('grid').addEventListener('change', (e) => {
		st.grid = e.target.value;
		draw();
	});
	el('flat').addEventListener('click', () => {
		st.items.forEach((i) => (i.sink = 0));
		panel();
		draw();
	});
	el('add-kind').innerHTML = Object.entries(SPECS)
		.map(([k, s]) => `<option value="${k}">${s.name}</option>`)
		.join('');
	el('add').addEventListener('click', () => {
		const kind = el('add-kind').value;
		let n = 2;
		while (st.items.some((i) => i.id === `${kind}${n}`)) n++;
		const item = { id: `${kind}${n}`, kind, u: snap(st.w / 2), z: snap(st.h / 2), sink: 0 };
		st.items.push(item);
		sel = item.id;
		partList();
		const b = el('add').getBoundingClientRect();
		panel(b.left, b.bottom);
		draw();
	});
	document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => view3d?.setView(b.dataset.view)));
	el('solid').addEventListener('input', (e) => {
		st.solid = +e.target.value;
		draw();
	});
	el('numbers').addEventListener('change', (e) => view3d?.setNumbers(e.target.checked));
	el('copy').addEventListener('click', async () => {
		const text = JSON.stringify(st);
		try {
			await navigator.clipboard.writeText(text);
			el('copy').textContent = 'Copied';
		} catch {
			el('copied').value = text;
			el('copied').hidden = false;
		}
	});

	note();
	syncBoard();
	partList();
	panel();
	draw();

	// three.js loads from a CDN. Without a connection the page keeps working with the flat drawing.
	Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/environments/RoomEnvironment.js')])
		.then(([THREE, { OrbitControls }, { RoomEnvironment }]) => {
			view3d = makeView3d(THREE, OrbitControls, RoomEnvironment, el('view'), (id, x, y) => {
				sel = id;
				panel(x, y);
				draw();
			});
			window.boardView = view3d;
			el('fallback').hidden = true;
			el('view').hidden = false;
			draw();
		})
		.catch((err) => {
			console.error('3D view did not load', err);
			el('view-tools').hidden = true;
		});
})();
