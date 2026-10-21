// The wiring page's checks, as plain functions of the data in wiring.mjs: the page and test-wiring.mjs both call them.
// Nothing here is typed in per part; every message and sum is worked out from the data.

export const spaceOf = (p) => (p.board === 'pico' ? 'pico' : 'pi');
export const wiresOf = (p) => p.pins.map((w, i) => ({ ...w, part: p, space: spaceOf(p), key: `${p.id}|${i}` }));
export const pinOf = (boards, space, n) => boards[space].pins.find((x) => x.n === n);

// Buck efficiency assumed when turning its 5 V load into 24 V input current.
const BUCK_EFFICIENCY = 0.9;

// Short label for the far end of a link: 'Pi USB 2 (a)' or 'Amp DC 24 V'.
export function endLabel(data, ref) {
	const [id, pin] = ref.split(/:(.*)/s);
	if (id === 'pi') return 'Pi ' + (data.piPorts.find((x) => x.id === pin)?.label ?? pin);
	const p = data.parts.find((x) => x.id === id);
	return p ? `${p.short} ${pin}` : ref;
}

// The links touching one part pin (a part's own pin name is `${id}:${partPin}`).
export const linksOf = (data, part, w) => data.links.filter((l) => l.a === `${part.id}:${w.partPin}` || l.b === `${part.id}:${w.partPin}`);
export const otherEnd = (l, part, w) => (l.a === `${part.id}:${w.partPin}` ? l.b : l.a);

// vis: array of the parts to check (the page passes what its filters show).
export function runChecks(data, vis) {
	const { boards, parts, limits } = data;
	const clashes = [];
	const add = (level, text) => clashes.push({ level, text });
	const nm = (w) => `${w.part.short} ${w.partPin}`;
	const isVis = (p) => vis.includes(p);

	for (const space of ['pi', 'pico']) {
		const board = boards[space];
		const uses = new Map();
		for (const p of vis.filter((q) => spaceOf(q) === space))
			for (const w of wiresOf(p)) if (w.to != null) uses.set(w.to, [...(uses.get(w.to) ?? []), w]);
		const busUsers = (bus) => vis.filter((q) => spaceOf(q) === space && q.pins.some((x) => x.bus === bus)).map((q) => q.short);
		const inUse = new Set(vis.filter((q) => spaceOf(q) === space).flatMap((q) => q.pins.map((x) => x.bus).filter(Boolean)));
		for (const [n, list] of uses) {
			const pin = pinOf(boards, space, n);
			const label = `${space === 'pi' ? 'Pi' : 'Pico'} pin ${n}`;
			if (!pin) {
				add('bad', `${label} does not exist (${list.map(nm).join(', ')}).`);
				continue;
			}
			const isSignal = ['gpio', 'id', 'ctl'].includes(pin.type);
			if (isSignal && list.length > 1) add('bad', `Two wires on one pin: ${label} (${pin.name}) is used by ${list.map(nm).join(' and ')}.`);
			for (const w of list) {
				if (w.dir === 'pwr' && isSignal) add('bad', `${nm(w)} is a power wire on ${label} (${pin.name}), a signal pin.`);
				if (w.dir !== 'pwr' && !isSignal) add('bad', `${nm(w)} is a signal on ${label} (${pin.name}), a ${pin.type} pin.`);
				if (pin.type === 'id') add('bad', `${nm(w)} is on ${label} (${pin.name}), the HAT ID EEPROM. Keep GPIO 0 and 1 free.`);
				if (w.fn && !pin.alts.some((a) => a.fn === w.fn)) add('bad', `${nm(w)} wants ${w.fn}, but ${label} (${pin.name}) offers ${pin.alts.map((a) => a.fn).join(', ') || 'nothing'}.`);
				// A bus pin used as plain GPIO while that bus is in use (only where the driver takes the bus whole).
				if (board.exclusive && w.dir !== 'pwr')
					for (const a of pin.alts)
						if (a.bus && inUse.has(a.bus) && w.bus !== a.bus)
							add('bad', `${nm(w)} uses ${label} (${pin.name}) as a plain GPIO, but it is ${a.fn} and ${a.bus.toUpperCase()} is in use by ${busUsers(a.bus).join(', ')}.`);
			}
		}
	}

	// Logic levels: a 5 V part fed from a 3.3 V GPIO needs a shifter named in its notes (or a via part that is shown).
	for (const p of vis.filter((q) => q.logic === '5v'))
		for (const w of wiresOf(p)) {
			const gpio = w.to != null && pinOf(boards, w.space, w.to)?.type === 'gpio';
			if (gpio && (w.dir === 'out' || w.dir === 'bi')) {
				if (w.via) {
					const via = parts.find((x) => x.id === w.via);
					if (!via) add('bad', `${nm(w)} goes through ${w.via}, which is not in the data.`);
					else if (!isVis(via)) add('warn', `${nm(w)} needs ${via.short} (a level shifter), which is hidden.`);
				} else if (!/level.?shift|shifter/i.test(`${w.note} ${p.note}`)) add('bad', `${nm(w)} is a 5 V part driven from a 3.3 V GPIO (pin ${w.to}) with no level shifter.`);
			}
			if (gpio && w.dir === 'in') add('bad', `${nm(w)} puts a 5 V signal on a 3.3 V GPIO (pin ${w.to}).`);
		}

	// Cables: every pin that is neither on a header nor linked, and every link end that does not exist.
	for (const l of data.links)
		for (const ref of [l.a, l.b]) {
			const [id, pin] = ref.split(/:(.*)/s);
			if (id === 'pi') {
				if (!data.piPorts.some((x) => x.id === pin)) add('bad', `Link ${l.a} to ${l.b}: no Pi port '${pin}'.`);
			} else {
				const p = parts.find((x) => x.id === id);
				if (!p || !p.pins.some((x) => x.partPin === pin)) add('bad', `Link ${l.a} to ${l.b}: no pin '${ref}'.`);
			}
		}
	for (const p of vis)
		for (const w of wiresOf(p))
			if (w.to == null && !linksOf(data, p, w).length) add('warn', `${nm(w)} goes nowhere: no header pin and no link.`);

	// Rail loads. A part's current counts against the first supply it is wired to; `draw` adds loads on other rails.
	const load = {};
	const addLoad = (id, mA, who) => {
		load[id] ??= { mA: 0, who: [] };
		load[id].mA += mA;
		if (mA) load[id].who.push(`${who} ${mA}`);
	};
	for (const p of vis) {
		const space = spaceOf(p);
		let src = null;
		for (const w of wiresOf(p)) {
			const t = w.to != null ? pinOf(boards, space, w.to)?.type : null;
			if (t === '5v') src = 'pi5v';
			else if (t === '3v3') src = space === 'pi' ? 'pi3v3' : 'pico3v3';
			else if (t === 'vbus' || t === 'vsys') src = 'picoVbus';
			if (src) break;
		}
		src ??= p.supply ?? (p.board === 'usb' && !p.view ? 'usb' : null);
		if (src && p.currentMa) addLoad(src, p.currentMa, p.short);
		for (const d of p.draw ?? []) addLoad(d.rail, d.mA, p.short);
	}
	if (load.buck) addLoad('v24', Math.round((load.buck.mA * 5) / 24 / BUCK_EFFICIENCY), 'Buck input');
	// Everything hanging off the Pico comes through its USB lead.
	const picoMa = (load.pico3v3?.mA ?? 0) + (load.picoVbus?.mA ?? 0);
	const rails = [];
	for (const id of ['pi5v', 'pi3v3', 'usb', 'buck', 'v24', 'pico3v3', 'picoVbus']) {
		const lim = limits[id];
		const mA = id === 'usb' ? (load.usb?.mA ?? 0) + picoMa : (load[id]?.mA ?? 0);
		if (!mA && !['pi5v', 'pi3v3', 'usb'].includes(id)) continue;
		const who = id === 'usb' ? [...(load.usb?.who ?? []), ...(picoMa ? [`Pico parts ${picoMa}`] : [])] : (load[id]?.who ?? []);
		const level = lim.mA && mA > lim.mA ? 'bad' : lim.mA && mA >= lim.mA * 0.8 ? 'warn' : 'ok';
		rails.push({ id, lim, mA, who, level });
	}
	return { clashes, rails };
}
