// The rotating view: every part built separately in mm, placed on the board from the same state the arranger edits.
// x runs along the board, y up it, z out from the wall. SPECS and pocketOf come from board.mjs, inlined before this.

function makeView3d(THREE, OrbitControls, RoomEnvironment, box, onPick) {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0xe9e6df);
	const renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
	renderer.shadowMap.enabled = true;
	box.appendChild(renderer.domElement);
	const labels = document.createElement('div');
	labels.className = 'labels';
	box.appendChild(labels);

	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	scene.environmentIntensity = 0.55;
	const sun = new THREE.DirectionalLight(0xffffff, 1.6);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0005;
	scene.add(sun, sun.target);

	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 6000);
	const controls = new OrbitControls(camera, renderer.domElement);
	controls.addEventListener('change', () => paint());

	const std = (color, metalness = 0, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
	const canvasTex = (w, h, fn) => {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		fn(c.getContext('2d'), w, h);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = 4;
		return t;
	};
	const woodTex = canvasTex(1024, 1024, (x, w, h) => {
		x.fillStyle = '#b98a55';
		x.fillRect(0, 0, w, h);
		for (let i = 0; i < 260; i++) {
			const y = (i * 397) % h;
			x.strokeStyle = `rgba(${i % 2 ? '84,50,20' : '220,175,120'},${0.06 + (i % 5) * 0.025})`;
			x.lineWidth = 1 + (i % 4);
			x.beginPath();
			x.moveTo(0, y);
			x.bezierCurveTo(w * 0.3, y + ((i * 13) % 26) - 13, w * 0.7, y + ((i * 7) % 26) - 13, w, y);
			x.stroke();
		}
	});
	woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
	woodTex.repeat.set(1 / 500, 1 / 500);

	const M = {
		wood: std(0xffffff, 0, 0.75, { map: woodTex, transparent: true }),
		floor: std(0x94693c, 0, 0.85, { transparent: true }),
		wall: std(0xf1eee8, 0, 0.95),
		cleat: std(0x8d6a42, 0, 0.8),
		brass: std(0xc8a24a, 0.85, 0.32),
		steel: std(0xc8ccd0, 0.8, 0.35),
		dark: std(0x24262a, 0.2, 0.55),
		pcb: std(0x1f6a44, 0.1, 0.55),
		rubber: std(0x151515, 0, 0.85),
		red: std(0xc23b2a, 0.05, 0.3),
		amber: std(0xe89a2c, 0, 0.25, { emissive: 0x7a3d00 }),
		knob: std(0x7b4f2a, 0, 0.55),
		ghost: new THREE.MeshBasicMaterial({ color: 0xc23b2a, transparent: true, opacity: 0.14, depthWrite: false }),
		ffc: new THREE.MeshStandardMaterial({ color: 0xd8b070, roughness: 0.6 }),
		cable: std(0x2c2c2c, 0, 0.7),
		select: new THREE.LineBasicMaterial({ color: 0xd9412b }),
		grid: new THREE.LineBasicMaterial({ color: 0x4a2f15, transparent: true, opacity: 0.4 }),
		hole: new THREE.MeshBasicMaterial({ color: 0x2a1b0e })
	};
	const faceMat = (w, h, fn) => new THREE.MeshStandardMaterial({ map: canvasTex(w, h, fn), roughness: 0.4 });
	const FONT = 'Helvetica,Arial,sans-serif';
	const screens = {
		eink: faceMat(696, 492, (x, w, h) => {
			x.fillStyle = '#ece8dc';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#22221f';
			x.font = `600 170px ${FONT}`;
			x.fillText('18:42', 44, 190);
			[250, 300, 350].forEach((y, i) => x.fillRect(46, y, [560, 600, 380][i], 12));
			x.font = `28px ${FONT}`;
			x.fillText('placeholder text', 46, 430);
		}),
		lcd: faceMat(460, 296, (x, w, h) => {
			x.fillStyle = '#0d1a22';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#7fe3c0';
			x.font = `600 62px ${FONT}`;
			x.fillText('Bus 7 min', 30, 100);
			x.fillRect(32, 140, 280, 9);
			x.fillRect(32, 170, 180, 9);
		}),
		lcdround: faceMat(320, 320, (x, w, h) => {
			x.fillStyle = '#120c07';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#f0b35a';
			x.font = `600 46px ${FONT}`;
			x.textAlign = 'center';
			x.fillText('Bus 7 min', w / 2, h / 2 + 16);
		}),
		display: faceMat(204, 153, (x, w, h) => {
			x.fillStyle = '#0d1a22';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#ffcc66';
			x.font = `600 48px ${FONT}`;
			x.fillText('4.2 c', 16, 74);
			x.fillRect(18, 100, 130, 7);
		}),
		oled: faceMat(212, 112, (x, w, h) => {
			x.fillStyle = '#050505';
			x.fillRect(0, 0, w, h);
			x.fillStyle = '#9fd8ff';
			x.font = `34px ${FONT}`;
			x.fillText('printing...', 12, 64);
		}),
		meter: faceMat(256, 256, (x, w) => {
			const c = w / 2;
			x.fillStyle = '#ece4cf';
			x.fillRect(0, 0, w, w);
			x.strokeStyle = '#2a2a2a';
			x.lineWidth = 4;
			for (let i = 0; i < 9; i++) {
				const a = ((-60 + i * 15) * Math.PI) / 180;
				x.beginPath();
				x.moveTo(c + 78 * Math.sin(a), c + 24 - 78 * Math.cos(a));
				x.lineTo(c + 100 * Math.sin(a), c + 24 - 100 * Math.cos(a));
				x.stroke();
			}
			x.strokeStyle = '#c23b2a';
			x.lineWidth = 5;
			x.beginPath();
			x.moveTo(c, c + 24);
			x.lineTo(c + 46, c - 56);
			x.stroke();
			x.fillStyle = '#222';
			x.beginPath();
			x.arc(c, c + 24, 10, 0, 7);
			x.fill();
		})
	};

	// Shapes, all in a part's own coordinates, starting at height z and rising by d.
	const mesh = (geo, mat, shadow = true) => {
		const m = new THREE.Mesh(geo, mat);
		m.castShadow = shadow;
		m.receiveShadow = shadow;
		return m;
	};
	const cube = (x, y, z, w, h, d, mat) => {
		const m = mesh(new THREE.BoxGeometry(w, h, d), mat);
		m.position.set(x + w / 2, y + h / 2, z + d / 2);
		return m;
	};
	const cyl = (x, y, z, r, d, mat, top = r) => {
		const m = mesh(new THREE.CylinderGeometry(top, r, d, 36), mat);
		m.rotation.x = Math.PI / 2;
		m.position.set(x, y, z + d / 2);
		return m;
	};
	const plate = (x, y, z, w, h, mat) => {
		const m = mesh(new THREE.PlaneGeometry(w, h), mat, false);
		m.position.set(x + w / 2, y + h / 2, z + 0.02);
		return m;
	};
	const disc = (x, y, z, r, mat) => {
		const m = mesh(new THREE.CircleGeometry(r, 36), mat, false);
		m.position.set(x, y, z + 0.02);
		return m;
	};
	const corners = (du, dz, inset) => [[inset, inset], [du - inset, inset], [inset, dz - inset], [du - inset, dz - inset]];
	const posts = (du, dz, inset, h, r) => corners(du, dz, inset).map(([x, y]) => cyl(x, y, 0, r, h, M.brass));

	// Each returns the meshes for one part. Heights must reach the part's `out` in SPECS: the page checks this on load.
	const build = {
		eink: () => {
			const { du, dz } = SPECS.eink;
			return [...posts(du, dz, 4, 8, 2.2), cube(0, 0, 8, du, dz, 4, M.dark), plate(3, 3, 12, du - 6, dz - 6, screens.eink)];
		},
		lcdround: () => {
			const { r, out } = SPECS.lcdround;
			return [cyl(0, 0, 0, r, out, M.brass), disc(0, 0, out, r - 10, screens.lcdround)];
		},
		lcd7: () => build.lcd(SPECS.lcd7),
		lcd: ({ du, dz } = SPECS.lcd) => {
			return [...posts(du, dz, 4, 8, 2.2), cube(0, 0, 8, du, dz, 1.6, M.pcb), cube(3, 3, 9.6, du - 6, dz - 6, 6.4, M.dark), plate(5, 5, 16, du - 10, dz - 10, screens.lcd)];
		},
		pi: () => {
			const f = 9.6;
			const out = [...posts(85, 56, 3.5, 8, 2.6), cube(0, 0, 8, 85, 56, 1.6, M.pcb)];
			out.push(cube(67, 34, f, 18, 16, 13.5, M.steel), cube(67, 20, f, 18, 13, 16, M.steel), cube(67, 6, f, 18, 13, 16, M.steel));
			out.push(cube(7, 49, f, 51, 5.5, 8.5, M.dark));
			[11, 26, 39].forEach((x) => out.push(cube(x - 4, 0, f, 8, 7, 3.2, M.steel)));
			out.push(cube(8, 7, f, 56, 40, 10, M.steel));
			for (let x = 10; x < 62; x += 3) out.push(cube(x, 7, f + 10, 1, 40, 0.4, M.dark));
			out.push(cyl(36, 27, f + 10, 15, 3, M.dark));
			// Room plugs need: USB and Ethernet on the right, power and HDMI below. Not solid, so it doesn't hide anything.
			const r = cube(85, 4, f, SPECS.pi.plug, 48, 16, M.ghost);
			const b = cube(0, -SPECS.pi.plugDown, f, 52, SPECS.pi.plugDown, 12, M.ghost);
			r.castShadow = b.castShadow = false;
			return [...out, r, b];
		},
		pico: () => [...posts(51, 21, 2, 6, 1.4), cube(0, 0, 6, 51, 21, 1.6, M.pcb), cube(-3, 6.5, 7.6, 8, 8, 3.4, M.steel), cube(18, 6.5, 7.6, 8, 8, 1, M.dark), cube(32, 5, 7.6, 14, 11, 1.2, M.steel)],
		display: () => {
			const out = [...posts(56, 35, 2.5, 6, 1.6), cube(0, 0, 6, 56, 35, 7.6, M.dark), cube(7.6, 2.2, 13.6, 40.8, 30.6, 3.4, M.dark), plate(8.6, 3.2, 17, 38.8, 28.6, screens.display)];
			[4.5, 30.5].forEach((y) => [3.8, 52.2].forEach((x) => out.push(cyl(x, y, 13.6, 1.7, 1.2, M.steel))));
			return out;
		},
		oled: () => {
			const { du, dz } = SPECS.oled;
			return [...posts(du, dz, 2.5, 9, 1.6), cube(0, 0, 9, du, dz, 1.6, M.pcb), cube(4, 7, 10.6, du - 8, dz - 12, 1.4, M.dark), plate(5, 8, 12, du - 10, dz - 14, screens.oled)];
		},
		thin: () => [cyl(0, 0, 0, 15, 5, M.brass), cyl(0, 0, 5, 12.5, 1, M.dark)],
		meter: () => [cyl(0, 0, 0, SPECS.meter.r, 10, M.brass), disc(0, 0, 10, SPECS.meter.r - 4, screens.meter)],
		knob: () => [cyl(0, 0, 0, 19, 2, M.brass), cyl(0, 0, 2, 15, 14, M.knob), cube(0, -1, 16, 12, 2, 0.3, M.brass)],
		print: () => [cyl(0, 0, 0, 20, 4, M.brass), cyl(0, 0, 4, 15, 8, M.red)],
		toggle: () => [0, 28, 56].flatMap((d) => [cyl(d, 0, 0, 5, 2, M.brass), cyl(d, 0, 2, 1.6, 16, M.steel, 2.4)]),
		lamp: () => {
			const dome = mesh(new THREE.SphereGeometry(6, 24, 12), M.amber);
			dome.scale.z = 7 / 6;
			dome.position.z = 3;
			return [cyl(0, 0, 0, 8, 3, M.brass), dome];
		},
		switch: () => [cyl(0, 0, 0, 9, 2, M.brass), cyl(0, 0, 2, 6, 2, M.steel), cyl(0, 0, 4, 2, 26, M.steel, 3)]
	};

	const root = new THREE.Group();
	scene.add(root);
	let pills = [];
	let current = null;
	let framed = false;
	let view = 'angle';
	let showNumbers = true;
	let wallMesh = null;

	function boardMesh(st) {
		const { w, h, t } = st;
		const WALL_GAP = gapOf(st);
		const outline = new THREE.Shape();
		outline.moveTo(0, 0);
		outline.lineTo(w, 0);
		outline.lineTo(w, h);
		outline.lineTo(0, h);
		outline.closePath();
		const taken = [];
		const out = [];
		const clash = (b) => taken.some((q) => b.u0 < q.u1 && q.u0 < b.u1 && b.z0 < q.z1 && q.z0 < b.z1);
		const inside = (b) => b.u0 > 0 && b.z0 > 0 && b.u1 < w && b.z1 < h;
		st.items.filter((i) => !i.hidden).forEach((i) => {
			if (i.sink) {
				const b = pocketOf(i);
				if (!inside(b) || clash(b)) return; // the warning list already says so; a bad hole would break the mesh
				taken.push(b);
				const hole = new THREE.Path();
				hole.moveTo(b.u0, b.z0);
				hole.lineTo(b.u0, b.z1);
				hole.lineTo(b.u1, b.z1);
				hole.lineTo(b.u1, b.z0);
				hole.closePath();
				outline.holes.push(hole);
				if (i.sink < t) out.push(cube(b.u0, b.z0, WALL_GAP, b.u1 - b.u0, b.z1 - b.z0, t - i.sink, M.floor));
			}
		});
		const geo = new THREE.ExtrudeGeometry(outline, { depth: t, bevelEnabled: false, curveSegments: 40 });
		const plank = mesh(geo, M.wood);
		plank.position.z = WALL_GAP;
		out.push(plank);
		[h - 50, 10].forEach((y) => out.push(cube(20, y, 0, w - 40, 40, WALL_GAP, M.cleat)));
		const F = WALL_GAP + t;
		corners(w, h, 12).forEach(([x, y]) => out.push(cyl(x, y, F, 3.2, 1.2, M.brass)));
		const pitch = 25;
		if (st.grid === 'holes') {
			const circle = new THREE.CircleGeometry(2.5, 14);
			const pts = [];
			for (let x = pitch; x < w; x += pitch) for (let y = pitch; y < h; y += pitch) pts.push([x, y]);
			const dots = new THREE.InstancedMesh(circle, M.hole, pts.length);
			const m = new THREE.Matrix4();
			pts.forEach(([x, y], n) => dots.setMatrixAt(n, m.makeTranslation(x, y, F + 0.05)));
			out.push(dots);
		} else if (st.grid === 'lines') {
			const p = [];
			for (let x = pitch; x < w; x += pitch) p.push(x, 0, F + 0.05, x, h, F + 0.05);
			for (let y = pitch; y < h; y += pitch) p.push(0, y, F + 0.05, w, y, F + 0.05);
			const g = new THREE.BufferGeometry();
			g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
			out.push(new THREE.LineSegments(g, M.grid));
		}
		return out;
	}

	function wires(st, F) {
		const byId = Object.fromEntries(st.items.filter((i) => !i.hidden).map((i) => [i.id, i]));
		const centre = (i) => {
			const b = boundsOf(i);
			return [(b.u0 + b.u1) / 2, (b.z0 + b.z1) / 2];
		};
		return (st.wires ?? []).flatMap(([from, to, cls]) => {
			if (!byId[from] || !byId[to]) return [];
			const [ax, ay] = centre(byId[from]);
			const [bx, by] = centre(byId[to]);
			const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(ax, ay, F + 1.5), new THREE.Vector3(ax, by, F + 1.5), new THREE.Vector3(bx, by, F + 1.5));
			return [mesh(new THREE.TubeGeometry(curve, 24, cls === 'ffc' ? 1.6 : 1, 6), cls === 'ffc' ? M.ffc : M.cable)];
		});
	}

	function clear(group) {
		group.traverse((o) => o.geometry?.dispose());
		group.clear();
	}

	function update(st, sel) {
		current = st;
		clear(root);
		M.wood.opacity = M.floor.opacity = (st.solid ?? 70) / 100;
		const F = gapOf(st) + st.t;
		const wall = cube(-3000, -3000, -4, st.w + 6000, st.h + 6000, 4, M.wall);
		wall.castShadow = false;
		wallMesh = wall;
		root.add(wall, ...boardMesh(st), ...wires(st, F));
		pills = [];
		st.items.filter((i) => !i.hidden).forEach((i) => {
			const part = new THREE.Group();
			part.position.set(i.u, i.z, F - (i.sink ?? 0));
			part.userData.id = i.id;
			part.add(...build[i.kind]());
			root.add(part);
			const b = boundsOf(i);
			pills.push({ at: new THREE.Vector3((b.u0 + b.u1) / 2, (b.z0 + b.z1) / 2, F + SPECS[i.kind].out - (i.sink ?? 0)), mm: SPECS[i.kind].out - (i.sink ?? 0), id: i.id });
			if (i.id === sel) {
				const edge = new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(b.u0 - 2, b.z0 - 2, F - (i.sink ?? 0)), new THREE.Vector3(b.u1 + 2, b.z1 + 2, F + SPECS[i.kind].out - (i.sink ?? 0))), 0xd9412b);
				root.add(edge);
			}
		});
		// Rulers along the board's width and height and out from the wall, true at any angle because the camera has no perspective.
		const reach = Math.ceil((F + Math.max(0, ...pills.map((p) => p.mm))) / 10) * 10 + 10;
		const ticks = [];
		const ruler = (axis, len, origin, tick, every) => {
			const at = (n, off = 0) => {
				const v = new THREE.Vector3(...origin);
				v.setComponent(axis, n);
				return v.add(new THREE.Vector3(...tick).multiplyScalar(off));
			};
			const dir = [0, 0, 0];
			dir[axis] = 1;
			ticks.push(...at(0), ...at(len));
			for (let n = 0; n <= len; n += 10) {
				ticks.push(...at(n), ...at(n, n % every ? 4 : 9));
				if (n % every === 0) pills.push({ at: at(n, 17), mm: axis === 2 && !n ? 'wall' : n, ruler: true, dir: new THREE.Vector3(...dir) });
			}
		};
		ruler(0, st.w, [0, -20, F], [0, -1, 0], 100);
		ruler(1, st.h, [-20, 0, 0], [-0.8, 0, 0.6], 100); // on the wall, so the Side view keeps it clear of the parts
		ruler(2, reach, [st.w + 20, -20, 0], [0, -1, 0], 50);
		const g = new THREE.BufferGeometry();
		g.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
		root.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x222222 })));

		sun.position.set(st.w * 0.2, st.h * 1.5, 700);
		sun.target.position.set(st.w / 2, st.h / 2, 0);
		const c = sun.shadow.camera;
		const span = Math.max(st.w, st.h) * 0.95;
		c.left = c.bottom = -span;
		c.right = c.top = span;
		c.far = 2000;
		c.updateProjectionMatrix();
		if (!framed) {
			framed = true;
			setView(view);
		}
		paint();
	}

	function fit(dir) {
		const { w, h, t } = current;
		const WALL_GAP = gapOf(current);
		const r = box.getBoundingClientRect();
		const aspect = r.width / Math.max(r.height, 1);
		const halfH = 0.5;
		camera.left = -halfH * aspect;
		camera.right = halfH * aspect;
		camera.top = halfH;
		camera.bottom = -halfH;
		const depth = WALL_GAP + t + 40;
		const tall = view === 'side' ? h + 110 : view === 'top' ? depth + 90 : h + 110;
		const wide = view === 'side' ? depth + 120 : w + 120;
		camera.zoom = Math.min(1 / tall, aspect / wide) * (view === 'angle' ? 0.82 : 1);
		const target = new THREE.Vector3(w / 2, h / 2 - 12, (WALL_GAP + t) / 2);
		controls.target.copy(target);
		camera.position.copy(target).add(dir.multiplyScalar(2000));
		camera.updateProjectionMatrix();
		controls.update();
	}

	const DIRS = { angle: [0.72, 0.28, 1], front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0.001], low: [-0.8, -0.45, 1], back: [-0.5, 0.2, -1] };
	function setView(name) {
		view = name;
		if (current) fit(new THREE.Vector3(...DIRS[name]).normalize());
		paint();
	}

	function drawLabels() {
		labels.textContent = '';
		if (!showNumbers || camera.position.z < 0) return; // numbers mean nothing from behind the board
		const r = box.getBoundingClientRect();
		const placed = [];
		const looking = camera.getWorldDirection(new THREE.Vector3());
		// Largest first; a number that would land on another is dropped, so the Side view stays readable.
		[...pills].filter((p) => !p.ruler || Math.abs(p.dir.dot(looking)) < 0.9).sort((a, b) => (b.ruler ? 1 : 0) - (a.ruler ? 1 : 0) || b.mm - a.mm).forEach((p) => {
			const q = p.at.clone().project(camera);
			const x = ((q.x + 1) / 2) * r.width;
			const y = ((1 - q.y) / 2) * r.height;
			if (!p.ruler && placed.some(([a, b]) => Math.abs(a - x) < 24 && Math.abs(b - y) < 17)) return;
			placed.push([x, y]);
			const d = document.createElement('span');
			d.className = p.ruler ? 'pill ruler' : 'pill';
			d.textContent = p.mm;
			d.style.left = `${x}px`;
			d.style.top = `${y}px`;
			labels.append(d);
		});
	}

	let queued = false;
	function paint() {
		if (queued) return;
		queued = true;
		requestAnimationFrame(() => {
			queued = false;
			if (wallMesh) wallMesh.visible = camera.position.z > 0; // from behind, the wall lifts away to show the back of the board
			renderer.render(scene, camera);
			drawLabels();
		});
	}

	new ResizeObserver(() => {
		const r = box.getBoundingClientRect();
		renderer.setSize(r.width, r.height);
		if (current) setView(view);
	}).observe(box);

	// A tap (not a rotate) picks the part under it.
	const ray = new THREE.Raycaster();
	let down = null;
	renderer.domElement.addEventListener('pointerdown', (e) => (down = [e.clientX, e.clientY]));
	renderer.domElement.addEventListener('pointerup', (e) => {
		if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
		const r = renderer.domElement.getBoundingClientRect();
		ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
		let id = null;
		for (const hit of ray.intersectObject(root, true)) {
			let o = hit.object;
			while (o && !o.userData.id) o = o.parent;
			if (o) {
				id = o.userData.id;
				break;
			}
		}
		onPick(id, e.clientX, e.clientY);
	});

	// How high each model really is, so a test can catch a drawing that disagrees with SPECS.
	const heights = () =>
		Object.fromEntries(
			Object.keys(build).map((k) => {
				const g = new THREE.Group();
				g.add(...build[k]());
				const top = new THREE.Box3().setFromObject(g).max.z;
				clear(g);
				return [k, +top.toFixed(1)];
			})
		);

	return {
		update,
		setView,
		heights,
		setNumbers: (on) => {
			showNumbers = on;
			paint();
		}
	};
}
