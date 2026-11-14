/**
 * Where the WhatsApp connection stands, and what a `close` leads to. Pure, so
 * the rules in docs/whatsapp.md (§Spike findings) are tested without a socket;
 * `whatsapp.ts` does the side effects (alerts, reconnect timers).
 *
 *   idle → connecting → (pairing →) open → close → waiting → connecting …
 *                                               ↘ dead (needs a person)
 */
import { DisconnectReason } from '@oxidezap/baileyrs';
import { logErr } from '#lib/server/log.ts';

/** WhatsApp rejected this client's Web build; the library has no constant for it. */
export const CLIENT_OUTDATED = 405;

/** The shortest wait before reconnecting after a close. */
export const RECONNECT_MS = 5_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export type Conn =
	| { kind: 'idle' }
	| { kind: 'connecting' }
	| { kind: 'pairing' }
	| { kind: 'open' }
	/** Reconnecting at `until`: after a plain drop, a temporary ban, or a failed connect. */
	| { kind: 'waiting'; until: number; reason: 'dropped' | 'banned' | 'connect-failed' }
	/** Stays down until someone re-links (logged out) or restarts it (replaced). */
	| { kind: 'dead'; reason: 'logged-out' | 'replaced' | 'rejected' };

type Waiting = Extract<Conn, { kind: 'waiting' }>;
type Dead = Extract<Conn, { kind: 'dead' }>;

/** The state after a `close` with this status code. `banExpireS` is the ban's end, in Unix seconds. */
export function afterClose(
	code: number | undefined,
	banExpireS: number | undefined,
	now: number
): Waiting | Dead {
	if (code === DisconnectReason.loggedOut) return { kind: 'dead', reason: 'logged-out' };
	// Another connection on the same login took over (the Mac and the box both
	// linked, or a dev reload). Fighting back makes the two kick each other off.
	if (code === DisconnectReason.connectionReplaced) return { kind: 'dead', reason: 'replaced' };
	// The version was fetched fresh (connect() fails otherwise), so WhatsApp
	// refuses the library itself; only an update fixes it.
	if (code === CLIENT_OUTDATED) return { kind: 'dead', reason: 'rejected' };
	if (code === DisconnectReason.forbidden) {
		const until = Math.max(now + RECONNECT_MS, (banExpireS ?? 0) * 1000);
		return { kind: 'waiting', until, reason: 'banned' };
	}
	return { kind: 'waiting', until: now + RECONNECT_MS, reason: 'dropped' };
}

/** After the `failures`-th failed connect in a row: back off 10 s, 20 s, … up to 15 min. */
export function afterConnectFailed(failures: number, now: number): Waiting {
	const wait = Math.min(RECONNECT_MS * 2 ** failures, MAX_BACKOFF_MS);
	return { kind: 'waiting', until: now + wait, reason: 'connect-failed' };
}

/** Why there's no socket to send on, in words for an error or a tool result. */
export function notConnected(c: Conn): string {
	switch (c.kind) {
		case 'dead':
			if (c.reason === 'rejected') return 'WhatsApp stopped: it rejected the client version';
			return c.reason === 'logged-out'
				? 'WhatsApp is logged out; re-link it on the bot phone'
				: 'WhatsApp stopped: another instance took over the login';
		case 'waiting':
			return c.reason === 'banned'
				? `WhatsApp is temporarily banned until ${new Date(c.until).toISOString()}`
				: 'WhatsApp is reconnecting';
		case 'pairing':
			return 'WhatsApp is waiting to be linked';
		case 'idle':
			return 'WhatsApp is not running';
		default:
			return 'WhatsApp is not connected yet';
	}
}

/** Mark a message read so the sender sees blue ticks. A failure is logged, never thrown. */
export async function markRead(
	sock: { readMessages(keys: never[]): Promise<unknown> } | undefined,
	key: unknown
) {
	if (!sock || !key) return;
	try {
		await sock.readMessages([key] as never[]);
	} catch (err) {
		logErr('whatsapp', 'read receipt failed', err);
	}
}
