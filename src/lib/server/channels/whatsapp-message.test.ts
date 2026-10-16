import { describe, expect, it } from 'vitest';
import { toIncoming, type WaMessage } from './whatsapp-message';
import type { FamilyMember } from '$lib/config';

const bot = { phone: '61400000000', lid: '111111111111111' };
const family: FamilyMember[] = [
	{ name: 'Parent1', role: 'parent', aliases: ['Parent1'], whatsapp: '+61 400 000 001' },
	{ name: 'Kid1', role: 'kid', aliases: ['Kid1'] }
];
const group = '120000000000000000@g.us';

const dm = (over: Partial<WaMessage> = {}): WaMessage => ({
	key: {
		id: 'A1',
		remoteJid: '222222222222222@lid',
		remoteJidAlt: '61400000001@s.whatsapp.net',
		fromMe: false
	},
	pushName: 'P1',
	messageTimestamp: 1792134972,
	message: { conversation: 'whats on today' },
	...over
});

const inGroup = (text: string, contextInfo?: object): WaMessage => ({
	key: {
		id: 'G1',
		remoteJid: group,
		participant: '222222222222222@lid',
		participantAlt: '61400000001@s.whatsapp.net',
		fromMe: false
	},
	pushName: 'P1',
	messageTimestamp: 1792134972,
	message: contextInfo ? { extendedTextMessage: { text, contextInfo } } : { conversation: text }
});

describe('toIncoming', () => {
	it('resolves a DM sender by phone and keys the thread on the phone JID', () => {
		const m = toIncoming(dm(), 'notify', bot, family)!;
		expect(m).toMatchObject({
			threadId: 'wa:61400000001@s.whatsapp.net',
			isDM: true,
			isMention: false,
			catchUp: false,
			text: 'whats on today'
		});
		expect(m.person?.name).toBe('Parent1');
		expect(m.sentAt.toISOString()).toBe('2026-10-16T07:16:12.000Z');
	});

	it('finds the phone when it is the primary address and the LID is the alt', () => {
		const flipped = dm({
			key: {
				id: 'A2',
				remoteJid: '61400000001@s.whatsapp.net',
				remoteJidAlt: '222222222222222@lid',
				fromMe: false
			}
		});
		expect(toIncoming(flipped, 'notify', bot, family)?.person?.name).toBe('Parent1');
	});

	it('drops strangers, the bot phone itself, and broadcasts', () => {
		const stranger = dm({ key: { ...dm().key, remoteJidAlt: '61499999999@s.whatsapp.net' } });
		expect(toIncoming(stranger, 'notify', bot, family)).toBeNull();
		expect(
			toIncoming(dm({ key: { ...dm().key, fromMe: true } }), 'notify', bot, family)
		).toBeNull();
		const status = dm({ key: { ...dm().key, remoteJid: 'status@broadcast' } });
		expect(toIncoming(status, 'notify', bot, family)).toBeNull();
	});

	it('detects a group @mention by LID and rewrites it to @chota', () => {
		const m = toIncoming(
			inGroup(`@${bot.lid} add milk`, { mentionedJid: [`${bot.lid}@lid`] }),
			'notify',
			bot,
			family
		)!;
		expect(m).toMatchObject({ threadId: `wa:${group}`, isMention: true, text: '@chota add milk' });
	});

	it("leaves other @mentions alone when the bot's LID is unknown", () => {
		const m = toIncoming(inGroup('hi @Kid1'), 'notify', { phone: bot.phone, lid: '' }, family)!;
		expect(m.text).toBe('hi @Kid1');
	});

	it('counts a reply to the bot as addressed, and plain chatter as not', () => {
		const reply = inGroup('yes please', { participant: `${bot.lid}@lid`, stanzaId: 'X' });
		expect(toIncoming(reply, 'notify', bot, family)?.isMention).toBe(true);
		expect(toIncoming(inGroup('dinner at 7'), 'notify', bot, family)?.isMention).toBe(false);
	});

	it('marks late delivery as catch-up', () => {
		expect(toIncoming(dm(), 'append', bot, family)?.catchUp).toBe(true);
	});
});
