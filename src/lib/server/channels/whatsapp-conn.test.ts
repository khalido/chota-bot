import { describe, expect, it } from 'vitest';
import { DisconnectReason } from '@oxidezap/baileyrs';
import { afterClose, afterConnectFailed, notConnected, RECONNECT_MS } from './whatsapp-conn';

const now = 1_800_000_000_000;

describe('afterClose', () => {
	it('stays down when logged out or replaced', () => {
		expect(afterClose(DisconnectReason.loggedOut, undefined, now)).toEqual({
			kind: 'dead',
			reason: 'logged-out'
		});
		expect(afterClose(DisconnectReason.connectionReplaced, undefined, now)).toEqual({
			kind: 'dead',
			reason: 'replaced'
		});
	});
	it('waits out a ban, but never less than the plain reconnect wait', () => {
		const expire = now / 1000 + 3600;
		expect(afterClose(DisconnectReason.forbidden, expire, now)).toEqual({
			kind: 'waiting',
			until: expire * 1000,
			reason: 'banned'
		});
		expect(afterClose(DisconnectReason.forbidden, undefined, now)).toMatchObject({
			until: now + RECONNECT_MS
		});
	});
	it('reconnects after any other close, including an unknown code', () => {
		for (const code of [
			DisconnectReason.connectionClosed,
			DisconnectReason.restartRequired,
			undefined
		])
			expect(afterClose(code, undefined, now)).toEqual({
				kind: 'waiting',
				until: now + RECONNECT_MS,
				reason: 'dropped'
			});
	});
});

describe('afterConnectFailed', () => {
	it('backs off from 10 s, doubling, up to 15 min', () => {
		expect(afterConnectFailed(1, now).until - now).toBe(10_000);
		expect(afterConnectFailed(2, now).until - now).toBe(20_000);
		expect(afterConnectFailed(20, now).until - now).toBe(15 * 60_000);
	});
});

describe('notConnected', () => {
	it('says why there is no socket', () => {
		expect(notConnected({ kind: 'dead', reason: 'logged-out' })).toMatch(/re-link/);
		expect(notConnected({ kind: 'dead', reason: 'replaced' })).toMatch(/another instance/);
		expect(notConnected({ kind: 'waiting', until: now, reason: 'banned' })).toMatch(/banned until/);
		expect(notConnected({ kind: 'waiting', until: now, reason: 'dropped' })).toMatch(
			/reconnecting/
		);
	});
});
