// Receiver side, with no DOM and no Cast: joins parts, enforces LIMITS and the revision rule, and keeps what is on
// screen. The Cast and demo transports both feed it; the page renders its `state`.
import { z } from 'zod';
import {
	Envelope,
	LIMITS,
	Payloads,
	VERSION,
	type Banner,
	type ErrorCode,
	type MessageType,
	type Reply,
	type Screen,
	type Theme
} from './schema.ts';

export type State = {
	screens: Screen[];
	/** Id of the screen on show; undefined while waiting. */
	current?: string;
	theme: Theme;
	/** Newest revision applied; 0 before any. */
	revision: number;
	/** When content last changed (ms), for the "updated … ago" line. */
	updatedAt?: number;
	/** The banner and when it goes (ms). */
	banner?: { text: string; tone: NonNullable<Banner['tone']>; until: number };
};

export const initialState = (): State => ({ screens: [], theme: {}, revision: 0 });

type Partial = {
	sender: string;
	id: string;
	type: string;
	revision: number;
	total: number;
	chunks: (string | undefined)[];
	received: number;
	bytes: number;
	startedAt: number;
};

/** A reply for one sender. */
export type Outbox = { to: string; reply: Reply }[];

class Refusal extends Error {
	constructor(
		readonly code: ErrorCode,
		message: string
	) {
		super(message);
	}
}

const utf8 = (s: string) => new TextEncoder().encode(s).length;
const issue = (e: z.ZodError) =>
	e.issues
		.slice(0, 3)
		.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`)
		.join('; ');

/** What a `pong` reports about the device: its user agent and recent frame rate, for checking a TV from a sender. */
export type About = { userAgent: string; fps?: number };

export function createCore(
	now: () => number = Date.now,
	about: () => About = () => ({ userAgent: '' })
) {
	let state = initialState();
	const partials = new Map<string, Partial>();
	const key = (sender: string, id: string) => `${sender}\u0000${id}`;

	const error = (to: string, code: ErrorCode, message: string, id?: string): Outbox => [
		{ to, reply: { v: 1, type: 'error', id, code, message, revision: state.revision } }
	];

	/** Apply one whole payload, or throw a Refusal. */
	function apply(type: MessageType, raw: unknown, revision: number) {
		const parsed = Payloads[type].safeParse(raw);
		if (!parsed.success)
			throw new Refusal(sizeIssue(parsed.error) ? 'too-big' : 'bad-message', issue(parsed.error));
		const next: State = { ...state, revision, updatedAt: now() };
		switch (type) {
			case 'screens': {
				const { screens, show } = parsed.data as z.infer<typeof Payloads.screens>;
				const ids = new Set(screens.map((s) => s.id));
				if (ids.size !== screens.length)
					throw new Refusal('bad-message', 'two screens share an id');
				if (show && !ids.has(show)) throw new Refusal('unknown-screen', `no screen "${show}"`);
				next.screens = screens;
				next.current =
					show ?? (state.current && ids.has(state.current) ? state.current : screens[0].id);
				break;
			}
			case 'screen': {
				const { screen } = parsed.data as z.infer<typeof Payloads.screen>;
				const at = state.screens.findIndex((s) => s.id === screen.id);
				if (at < 0 && state.screens.length >= LIMITS.screens)
					throw new Refusal('too-big', `already ${LIMITS.screens} screens`);
				next.screens =
					at < 0
						? [...state.screens, screen]
						: state.screens.map((s, i) => (i === at ? screen : s));
				next.current = state.current ?? screen.id;
				break;
			}
			case 'show': {
				const { screen } = parsed.data as z.infer<typeof Payloads.show>;
				if (!state.screens.some((s) => s.id === screen))
					throw new Refusal('unknown-screen', `no screen "${screen}"`);
				next.current = screen;
				next.updatedAt = state.updatedAt;
				break;
			}
			case 'theme':
				next.theme = parsed.data as Theme;
				next.updatedAt = state.updatedAt;
				break;
			case 'clear':
				next.screens = [];
				next.current = undefined;
				next.updatedAt = undefined;
				next.banner = undefined;
				break;
			case 'banner': {
				const { text, tone = 'info', seconds = 30 } = parsed.data as Banner;
				next.banner = seconds > 0 ? { text, tone, until: now() + seconds * 1000 } : undefined;
				next.updatedAt = state.updatedAt;
				break;
			}
		}
		state = next;
	}

	return {
		get state() {
			return state;
		},

		/** One message from a sender: the replies to send, and whether `state` changed. */
		receive(sender: string, message: unknown): { out: Outbox; changed: boolean } {
			const env = Envelope.safeParse(message);
			if (!env.success)
				return { out: error(sender, 'bad-message', issue(env.error)), changed: false };
			const m = env.data;
			const fail = (code: ErrorCode, why: string) => ({
				out: error(sender, code, why, m.id),
				changed: false
			});
			if (m.v !== VERSION) return fail('version', `this receiver speaks v${VERSION}, not v${m.v}`);
			if (!(m.type in Payloads)) return fail('bad-message', `unknown type "${m.type}"`);
			if (m.type === 'ping') {
				const reply: Reply = {
					v: 1,
					type: 'pong',
					id: m.id,
					revision: state.revision,
					screen: state.current,
					screens: state.screens.map((s) => s.id),
					...about()
				};
				return { out: [{ to: sender, reply }], changed: false };
			}
			if (m.revision < state.revision) {
				partials.delete(key(sender, m.id));
				return fail('stale', `revision ${m.revision} is older than ${state.revision}`);
			}
			const type = m.type as MessageType;
			const seq = m.seq ?? 0;
			const total = m.total ?? 1;

			let data: unknown = m.data;
			if (total > 1 || m.chunk !== undefined) {
				if (total > LIMITS.parts) return fail('too-big', `${total} parts; at most ${LIMITS.parts}`);
				if (seq >= total) return fail('bad-message', `part ${seq} of ${total}`);
				if (m.chunk === undefined)
					return fail('bad-message', 'a part of a split payload carries chunk, not data');
				const k = key(sender, m.id);
				let p = partials.get(k);
				if (p && (p.total !== total || p.type !== m.type || p.revision !== m.revision)) {
					partials.delete(k);
					return fail('bad-message', 'parts of one payload disagree on total, type or revision');
				}
				if (!p) {
					if (partials.size >= LIMITS.pending)
						return fail('busy', `${LIMITS.pending} payloads already half-received`);
					p = {
						sender,
						id: m.id,
						type: m.type,
						revision: m.revision,
						total,
						chunks: Array(total),
						received: 0,
						bytes: 0,
						startedAt: now()
					};
					partials.set(k, p);
				}
				if (p.chunks[seq] === undefined) {
					p.chunks[seq] = m.chunk;
					p.received++;
					p.bytes += utf8(m.chunk);
				}
				if (p.bytes > LIMITS.payloadBytes) {
					partials.delete(k);
					return fail('too-big', `payload over ${LIMITS.payloadBytes} bytes`);
				}
				if (p.received < total) return { out: [], changed: false };
				partials.delete(k);
				try {
					data = JSON.parse(p.chunks.join(''));
				} catch {
					return fail('bad-message', 'the joined chunks are not JSON');
				}
			}
			// Checked again at the end: a newer revision may have landed while the parts came in.
			if (m.revision < state.revision)
				return fail('stale', `revision ${m.revision} is older than ${state.revision}`);
			try {
				apply(type, data, m.revision);
			} catch (e) {
				if (e instanceof Refusal) return fail(e.code, e.message);
				throw e;
			}
			return {
				out: [{ to: sender, reply: { v: 1, type: 'ack', id: m.id, revision: state.revision } }],
				changed: true
			};
		},

		/** Show another screen from the remote: no revision, nothing to reply. False when there is no such screen. */
		select(id: string) {
			if (!state.screens.some((s) => s.id === id)) return false;
			state = { ...state, current: id };
			return true;
		},

		/** A sender left: drop its half-received payloads. */
		senderGone(sender: string) {
			for (const [k, p] of partials) if (p.sender === sender) partials.delete(k);
		},

		/** Drop payloads whose parts stopped arriving; call every few seconds. */
		sweep(): Outbox {
			const out: Outbox = [];
			for (const [k, p] of partials)
				if (now() - p.startedAt > LIMITS.partialMs) {
					partials.delete(k);
					out.push(
						...error(
							p.sender,
							'timeout',
							`got ${p.received} of ${p.total} parts in ${LIMITS.partialMs / 1000} s`,
							p.id
						)
					);
				}
			return out;
		},

		/** How many payloads are half-received (for tests and the debug line). */
		get pending() {
			return partials.size;
		}
	};
}

/** A refusal for a limit (too many screens, blocks, items, characters) rather than a malformed payload. */
function sizeIssue(e: z.ZodError) {
	return e.issues.some(
		(i) => i.code === 'too_big' || (i.code === 'custom' && /over \d+ characters/.test(i.message))
	);
}
