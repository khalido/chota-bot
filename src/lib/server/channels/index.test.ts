import { describe, expect, it, vi } from 'vitest';
import type { Incoming } from './types';

vi.mock('./telegram', () => ({ telegramChannel: () => null }));
vi.mock('./whatsapp', () => ({ whatsappChannel: () => null }));
vi.mock('./triage', () => ({ triage: vi.fn(), triageHint: vi.fn() }));
vi.mock('$lib/server/agent', () => ({ runAgentStream: vi.fn() }));
vi.mock('$lib/server/agent/history', () => ({}));
vi.mock('$lib/server/log', () => ({ event: vi.fn(), logErr: vi.fn() }));

const { shouldAnswer } = await import('./index');

const now = new Date('2026-10-16T09:00:00+11:00').getTime();
const msg = (over: Partial<Incoming> = {}): Incoming => ({
	threadId: 'wa:120@g.us',
	channel: 'whatsapp',
	messageId: 'm1',
	person: null,
	senderName: 'Parent1',
	text: 'what is on today',
	isDM: false,
	isMention: false,
	catchUp: false,
	sentAt: new Date(now),
	...over
});

describe('shouldAnswer', () => {
	it('answers DMs and mentions, not other group chatter', () => {
		expect(shouldAnswer(msg({ isDM: true }), now)).toBe(true);
		expect(shouldAnswer(msg({ isMention: true }), now)).toBe(true);
		expect(shouldAnswer(msg(), now)).toBe(false);
	});

	it('answers a catch-up message only while it is recent', () => {
		const late = (mins: number) =>
			msg({ isDM: true, catchUp: true, sentAt: new Date(now - mins * 60_000) });
		expect(shouldAnswer(late(5), now)).toBe(true);
		expect(shouldAnswer(late(30), now)).toBe(false);
	});

	it('ignores empty text', () => {
		expect(shouldAnswer(msg({ isDM: true, text: '  ' }), now)).toBe(false);
	});
});
