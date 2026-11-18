import { describe, expect, it } from 'vitest';
import { createCore } from './core.ts';
import { LIMITS } from './schema.ts';
import { split } from './split.ts';

const screen = (id: string, extra = '') => ({
	id,
	title: id,
	blocks: [{ type: 'text' as const, text: `hello ${id}${extra}` }]
});

/** As the TV sees it: every message through JSON, as Cast carries it. */
const wire = (m: unknown) => JSON.parse(JSON.stringify(m));

function setup() {
	let t = 1_000;
	const core = createCore(() => t);
	return { core, tick: (ms: number) => (t += ms) };
}

describe('split and join', () => {
	it('sends a small payload as one message with data', () => {
		const msgs = split('screens', { screens: [screen('a')] }, { id: 'x', revision: 1 });
		expect(msgs).toHaveLength(1);
		expect(msgs[0]).toMatchObject({
			v: 1,
			id: 'x',
			seq: 0,
			total: 1,
			data: { screens: [{ id: 'a' }] }
		});
	});

	it('splits a large payload into parts under the byte limit, escapes and UTF-8 included', () => {
		// Quotes, backslashes and emoji grow when escaped and encoded: the slice length alone would overshoot.
		const big = {
			screens: [screen('a', '"\\🙂é'.repeat(12_000)), screen('b', 'x'.repeat(19_000))]
		};
		const msgs = split('screens', big, { id: 'x', revision: 1 });
		expect(msgs.length).toBeGreaterThan(1);
		for (const m of msgs)
			expect(new TextEncoder().encode(JSON.stringify(m)).length).toBeLessThanOrEqual(
				LIMITS.partBytes
			);
		expect(JSON.parse(msgs.map((m) => m.chunk).join(''))).toEqual(big);
	});

	it('joins parts that arrive out of order and acks once', () => {
		const { core } = setup();
		const big = { screens: [screen('a', 'x'.repeat(15_000)), screen('b', 'y'.repeat(15_000))] };
		const msgs = split('screens', big, { id: 'p', revision: 5, maxBytes: 8_000 }).reverse();
		const outs = msgs.map((m) => core.receive('s1', wire(m)));
		expect(outs.slice(0, -1).every((o) => o.out.length === 0 && !o.changed)).toBe(true);
		expect(outs.at(-1)).toMatchObject({
			changed: true,
			out: [{ to: 's1', reply: { type: 'ack', id: 'p', revision: 5 } }]
		});
		expect(core.state.screens.map((s) => s.id)).toEqual(['a', 'b']);
		expect(core.pending).toBe(0);
	});

	it('keeps two senders’ parts with the same id apart', () => {
		const { core } = setup();
		const a = split(
			'screens',
			{ screens: [screen('a', 'x'.repeat(9_000))] },
			{ id: 'same', revision: 1, maxBytes: 4_000 }
		);
		const b = split(
			'screens',
			{ screens: [screen('b', 'y'.repeat(9_000))] },
			{ id: 'same', revision: 2, maxBytes: 4_000 }
		);
		for (let i = 0; i < Math.max(a.length, b.length); i++) {
			if (a[i]) core.receive('s1', wire(a[i]));
			if (b[i]) core.receive('s2', wire(b[i]));
		}
		expect(core.state.screens.map((s) => s.id)).toEqual(['b']);
	});

	it('drops a half-received payload on timeout, with an error to its sender', () => {
		const { core, tick } = setup();
		const msgs = split(
			'screens',
			{ screens: [screen('a', 'x'.repeat(9_000))] },
			{ id: 't', revision: 1, maxBytes: 4_000 }
		);
		core.receive('s1', wire(msgs[0]));
		tick(LIMITS.partialMs - 1);
		expect(core.sweep()).toEqual([]);
		tick(2);
		expect(core.sweep()).toMatchObject([
			{ to: 's1', reply: { type: 'error', code: 'timeout', id: 't' } }
		]);
		expect(core.pending).toBe(0);
		// The rest arriving late starts a new payload rather than completing a dropped one.
		for (const m of msgs.slice(1)) expect(core.receive('s1', wire(m)).changed).toBe(false);
		expect(core.state.screens).toEqual([]);
	});

	it('drops a sender’s half-received payloads when it disconnects', () => {
		const { core } = setup();
		const msgs = split(
			'screens',
			{ screens: [screen('a', 'x'.repeat(9_000))] },
			{ id: 'd', revision: 1, maxBytes: 4_000 }
		);
		core.receive('s1', wire(msgs[0]));
		core.receive('s2', wire(msgs[0]));
		core.senderGone('s1');
		expect(core.pending).toBe(1);
	});
});

describe('limits', () => {
	it('refuses too many parts', () => {
		const { core } = setup();
		const r = core.receive('s', {
			v: 1,
			id: 'x',
			type: 'screens',
			revision: 1,
			seq: 0,
			total: LIMITS.parts + 1,
			chunk: '{'
		});
		expect(r.out[0].reply).toMatchObject({ type: 'error', code: 'too-big' });
	});

	it('refuses a joined payload over the byte limit as soon as it passes it', () => {
		const { core } = setup();
		const chunk = 'x'.repeat(59_000);
		const parts = Math.ceil(LIMITS.payloadBytes / chunk.length) + 1;
		let seq = 0;
		let r;
		do
			r = core.receive('s', {
				v: 1,
				id: 'x',
				type: 'screens',
				revision: 1,
				seq: seq++,
				total: parts,
				chunk
			});
		while (r.out.length === 0 && seq < parts);
		expect(r.out[0].reply).toMatchObject({ code: 'too-big' });
		expect(seq).toBe(Math.floor(LIMITS.payloadBytes / chunk.length) + 1);
		expect(core.pending).toBe(0);
	});

	it('refuses more half-received payloads than it holds', () => {
		const { core } = setup();
		for (let i = 0; i < LIMITS.pending; i++)
			expect(
				core.receive('s', {
					v: 1,
					id: `p${i}`,
					type: 'screens',
					revision: 1,
					seq: 0,
					total: 2,
					chunk: '{'
				}).out
			).toEqual([]);
		const r = core.receive('s', {
			v: 1,
			id: 'one-more',
			type: 'screens',
			revision: 1,
			seq: 0,
			total: 2,
			chunk: '{'
		});
		expect(r.out[0].reply).toMatchObject({ code: 'busy' });
	});

	it('refuses more screens than the limit', () => {
		const { core } = setup();
		const screens = Array.from({ length: LIMITS.screens + 1 }, (_, i) => screen(`s${i}`));
		const r = core.receive('s', wire(split('screens', { screens }, { revision: 1 })[0]));
		expect(r.out[0].reply).toMatchObject({ code: 'too-big' });
	});

	it('refuses a wrong version, an unknown type and a bad payload, with the current revision', () => {
		const { core } = setup();
		core.receive('s', wire(split('screens', { screens: [screen('a')] }, { revision: 7 })[0]));
		expect(
			core.receive('s', { v: 2, id: 'x', type: 'show', revision: 9, data: { screen: 'a' } }).out[0]
				.reply
		).toMatchObject({ code: 'version', revision: 7 });
		expect(
			core.receive('s', { v: 1, id: 'x', type: 'dance', revision: 9 }).out[0].reply
		).toMatchObject({ code: 'bad-message' });
		expect(
			core.receive('s', {
				v: 1,
				id: 'x',
				type: 'screens',
				revision: 9,
				data: { screens: [{ id: 'a' }] }
			}).out[0].reply
		).toMatchObject({ code: 'bad-message' });
		expect(core.receive('s', 'hello').out[0].reply).toMatchObject({ code: 'bad-message' });
	});

	it('refuses image URLs other than https: and data:image', () => {
		const { core } = setup();
		const bad = { id: 'a', title: 'a', blocks: [{ type: 'image', src: 'javascript:alert(1)' }] };
		const r = core.receive('s', {
			v: 1,
			id: 'x',
			type: 'screens',
			revision: 1,
			data: { screens: [bad] }
		});
		expect(r.out[0].reply).toMatchObject({ code: 'bad-message' });
	});
});

describe('revision', () => {
	it('lets the newest revision win between two senders, and tells the stale one the current revision', () => {
		const { core } = setup();
		core.receive(
			'a',
			wire(split('screens', { screens: [screen('from-a')] }, { revision: 100 })[0])
		);
		core.receive(
			'b',
			wire(split('screens', { screens: [screen('from-b')] }, { revision: 200 })[0])
		);
		const stale = core.receive(
			'a',
			wire(split('screens', { screens: [screen('again-a')] }, { id: 'late', revision: 150 })[0])
		);
		expect(stale.changed).toBe(false);
		expect(stale.out).toEqual([
			{
				to: 'a',
				reply: expect.objectContaining({ type: 'error', code: 'stale', id: 'late', revision: 200 })
			}
		]);
		expect(core.state.screens[0].id).toBe('from-b');
	});

	it('accepts an equal revision, so one sender can send several messages at the same revision', () => {
		const { core } = setup();
		core.receive(
			'a',
			wire(split('screens', { screens: [screen('x'), screen('y')] }, { revision: 5 })[0])
		);
		expect(
			core.receive('a', wire(split('show', { screen: 'y' }, { revision: 5 })[0])).changed
		).toBe(true);
		expect(core.state.current).toBe('y');
	});

	it('refuses a split payload overtaken by a newer revision while its parts were arriving', () => {
		const { core } = setup();
		const slow = split(
			'screens',
			{ screens: [screen('slow', 'x'.repeat(9_000))] },
			{ revision: 10, maxBytes: 4_000 }
		);
		core.receive('a', wire(slow[0]));
		core.receive('b', wire(split('screens', { screens: [screen('fast')] }, { revision: 20 })[0]));
		const outs = slow.slice(1).map((m) => core.receive('a', wire(m)));
		expect(outs.at(-1)!.out[0].reply).toMatchObject({ code: 'stale' });
		expect(core.state.screens[0].id).toBe('fast');
		expect(core.pending).toBe(0);
	});
});

describe('message types', () => {
	it('takes the morning-by-person screen: people colours, leave, person, wear and trace', () => {
		const { core } = setup();
		const send = (type: Parameters<typeof split>[0], data: unknown) =>
			core.receive('s', wire(split(type, data, { revision: 1 })[0]));
		const at = '2026-11-18T08:30:00+11:00';
		expect(send('theme', { people: { Kid1: '#7fa7c9' } }).out[0].reply.type).toBe('ack');
		expect(send('theme', { people: { Kid1: 'blue' } }).out[0].reply).toMatchObject({
			code: 'bad-message'
		});
		const morning = {
			id: 'm',
			title: 'Morning',
			columns: 4,
			blocks: [
				{ type: 'leave', at, note: 'M30 to school' },
				{
					type: 'weather',
					now: { tempC: 18, condition: 'Showers', wear: 'Umbrella' },
					trace: [{ at, tempC: 18 }]
				},
				{
					type: 'person',
					span: 2,
					name: 'Kid1',
					hours: { start: at, end: at },
					nudge: 'PE today',
					dates: [{ date: '2026-12-09', title: 'Camp' }],
					events: [{ title: 'Football', start: at }],
					chores: [{ text: 'Feed the cat', done: true }]
				}
			]
		};
		expect(send('screens', { screens: [morning] }).out[0].reply.type).toBe('ack');
		expect(
			send('screens', { screens: [{ ...morning, blocks: [{ type: 'person' }] }] }).out[0].reply
		).toMatchObject({ code: 'bad-message' });
	});

	it('updates one screen in place, adds a new one, shows, themes and clears', () => {
		const { core } = setup();
		const send = (type: Parameters<typeof split>[0], data: unknown) =>
			core.receive('s', wire(split(type, data, { revision: 1 })[0]));
		send('screens', { screens: [screen('a'), screen('b')], show: 'b' });
		expect(core.state.current).toBe('b');
		send('screen', { screen: { ...screen('a'), title: 'A2' } });
		expect(core.state.screens.map((s) => s.title)).toEqual(['A2', 'b']);
		send('screen', { screen: screen('c') });
		expect(core.state.screens.map((s) => s.id)).toEqual(['a', 'b', 'c']);
		expect(send('show', { screen: 'nope' }).out[0].reply).toMatchObject({ code: 'unknown-screen' });
		expect(send('theme', { timezone: 'Mars/Olympus' }).out[0].reply).toMatchObject({
			code: 'bad-message'
		});
		expect(send('theme', { brightness: 'blinding' }).out[0].reply).toMatchObject({
			code: 'bad-message'
		});
		send('theme', { brightness: 'bright' });
		expect(core.state.theme).toEqual({ brightness: 'bright' });
		send('theme', { accent: '#7aa2c8', density: 'compact' });
		expect(core.state.theme).toEqual({ accent: '#7aa2c8', density: 'compact' });
		send('clear', undefined);
		expect(core.state).toMatchObject({ screens: [], current: undefined, revision: 1 });
	});

	it('keeps the current screen across a screens replace when it still exists', () => {
		const { core } = setup();
		const send = (type: Parameters<typeof split>[0], data: unknown) =>
			core.receive('s', wire(split(type, data, { revision: 1 })[0]));
		send('screens', { screens: [screen('a'), screen('b')], show: 'b' });
		send('screens', { screens: [screen('b'), screen('c')] });
		expect(core.state.current).toBe('b');
		send('screens', { screens: [screen('c')] });
		expect(core.state.current).toBe('c');
	});

	it('refuses a screen with both blocks and html', () => {
		const { core } = setup();
		const r = core.receive('s', {
			v: 1,
			id: 'x',
			type: 'screen',
			revision: 1,
			data: { screen: { ...screen('a'), html: { html: '<p>x</p>' } } }
		});
		expect(r.out[0].reply).toMatchObject({ code: 'bad-message' });
	});
});

describe('v1 additions', () => {
	const send = (
		core: ReturnType<typeof createCore>,
		type: Parameters<typeof split>[0],
		data: unknown,
		revision = 1
	) => core.receive('s', wire(split(type, data, { revision })[0]));

	it('shows a banner for its seconds, replaces it, and takes it down with seconds 0', () => {
		const { core, tick } = setup();
		send(core, 'banner', { text: 'Shoes on', seconds: 10 });
		expect(core.state.banner).toEqual({ text: 'Shoes on', tone: 'info', until: 11_000 });
		tick(1_000);
		send(core, 'banner', { text: 'Bus now', tone: 'warn' });
		expect(core.state.banner).toMatchObject({ text: 'Bus now', tone: 'warn', until: 32_000 });
		send(core, 'banner', { text: 'x', seconds: 0 });
		expect(core.state.banner).toBeUndefined();
		expect(core.state.updatedAt).toBeUndefined();
	});

	it('answers ping with pong whatever the revision, and changes nothing', () => {
		const { core } = setup();
		send(core, 'screens', { screens: [screen('a'), screen('b')] }, 50);
		const r = core.receive('s', { v: 1, id: 'p1', type: 'ping', revision: 0 });
		expect(r.changed).toBe(false);
		expect(r.out[0].reply).toEqual({
			v: 1,
			type: 'pong',
			id: 'p1',
			revision: 50,
			screen: 'a',
			screens: ['a', 'b'],
			userAgent: ''
		});
	});

	it('selects a screen from the remote without touching the revision', () => {
		const { core } = setup();
		send(core, 'screens', { screens: [screen('a'), screen('b')] }, 7);
		expect(core.select('b')).toBe(true);
		expect(core.select('nope')).toBe(false);
		expect(core.state).toMatchObject({ current: 'b', revision: 7 });
	});

	it('accepts a week block and refuses a bad date or more than seven days', () => {
		const { core } = setup();
		const week = (days: unknown[]) => ({
			screens: [{ id: 'w', title: 'Week', blocks: [{ type: 'week', days }] }]
		});
		const day = (date: string) => ({
			date,
			events: [{ title: 'Swim', start: '2026-11-17T16:00:00+11:00' }]
		});
		expect(send(core, 'screens', week([day('2026-11-17'), day('2026-11-18')])).changed).toBe(true);
		expect(send(core, 'screens', week([day('17/11/2026')])).out[0].reply).toMatchObject({
			code: 'bad-message'
		});
		const eight = Array.from({ length: 8 }, (_, i) => day(`2026-11-${10 + i}`));
		expect(send(core, 'screens', week(eight)).out[0].reply).toMatchObject({ type: 'error' });
	});
});
