import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
import { DisconnectReason } from '@oxidezap/baileyrs';
import {
	afterClose,
	CLIENT_OUTDATED,
	markRead,
	afterConnectFailed,
	notConnected,
	RECONNECT_MS
} from './whatsapp-conn';

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

describe('rejected build and bad session', () => {
	it('405 stops for good', () => {
		expect(afterClose(CLIENT_OUTDATED, undefined, now)).toEqual({
			kind: 'dead',
			reason: 'rejected'
		});
		expect(notConnected({ kind: 'dead', reason: 'rejected' })).toMatch(/rejected/);
	});
	it('500 keeps the plain retry', () => {
		expect(afterClose(DisconnectReason.badSession, undefined, now)).toEqual({
			kind: 'waiting',
			until: now + RECONNECT_MS,
			reason: 'dropped'
		});
	});
});

describe('markRead', () => {
	const key = { id: 'A1', remoteJid: 'x@s.whatsapp.net' };
	it('sends a read receipt for the message key', async () => {
		const readMessages = vi.fn().mockResolvedValue(undefined);
		await markRead({ readMessages }, key);
		expect(readMessages).toHaveBeenCalledWith([key]);
	});
	it('swallows a failure', async () => {
		const readMessages = vi.fn().mockRejectedValue(new Error('offline'));
		await expect(markRead({ readMessages }, key)).resolves.toBeUndefined();
	});
	it('does nothing without a socket or key', async () => {
		await expect(markRead(undefined, key)).resolves.toBeUndefined();
		const readMessages = vi.fn();
		await markRead({ readMessages }, undefined);
		expect(readMessages).not.toHaveBeenCalled();
	});
});
