import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Incoming } from './types';

const inserted: unknown[] = [];
vi.mock('$lib/server/db', () => ({
	db: { insert: () => ({ values: (v: unknown) => ({ run: () => inserted.push(v) }) }) }
}));
vi.mock('$lib/server/db/schema', () => ({ decision: {} }));
vi.mock('$lib/server/log', () => ({ logErr: vi.fn() }));
const decideChoice = vi.fn();
vi.mock('$lib/server/decide', () => ({ decideChoice, questionsHash: () => 'h' }));

const { triage } = await import('./triage');

const m: Incoming = {
	threadId: 'wa:120@g.us',
	channel: 'whatsapp',
	messageId: 'M1',
	person: null,
	senderName: 'Parent1',
	text: 'we are out of milk',
	isDM: false,
	isMention: false,
	catchUp: false,
	sentAt: new Date()
};

beforeEach(() => {
	inserted.length = 0;
	decideChoice.mockReset();
});

describe('triage', () => {
	it('acts on a list kind over the threshold and stores the verdict', async () => {
		decideChoice.mockResolvedValue({
			pick: 'shopping_item',
			probabilities: { shopping_item: 0.96, none: 0.04 },
			model: 'typesafe-ai/jev'
		});
		expect(await triage(m, [])).toEqual({ kind: 'shopping_item', probability: 0.96 });
		expect(inserted[0]).toMatchObject({ pick: 'shopping_item', acted: true, messageId: 'M1' });
	});

	it('stores but ignores questions, chat, and anything under the threshold', async () => {
		for (const [pick, p] of [
			['question', 0.91],
			['none', 1],
			['shopping_item', 0.6]
		] as const) {
			decideChoice.mockResolvedValue({ pick, probabilities: { [pick]: p }, model: 'jev' });
			expect(await triage(m, [])).toBeNull();
		}
		expect(inserted).toHaveLength(3);
		expect(inserted.every((r) => (r as { acted: boolean }).acted === false)).toBe(true);
	});

	it('treats a failed call as no suggestion', async () => {
		decideChoice.mockRejectedValue(new Error('Service temporarily unavailable'));
		expect(await triage(m, [])).toBeNull();
		expect(inserted).toHaveLength(0);
	});
});
