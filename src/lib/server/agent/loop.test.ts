import { describe, expect, it } from 'vitest';
import {
	ANSWER_NOW,
	MAX_STEPS,
	STOP_WHEN,
	TURN_COST,
	pastHardCost,
	answerWhenDone,
	lookupsAsText,
	QUIET_TOOLS,
	TURN_TIMEOUT
} from './loop';

describe('answerWhenDone', () => {
	it('leaves every step but the last alone', () => {
		expect(answerWhenDone({ stepNumber: MAX_STEPS - 2, messages: [], instructions: 'x' })).toEqual(
			{}
		);
	});

	it('takes the tools away and says to answer on the last step', () => {
		const r = answerWhenDone({ stepNumber: MAX_STEPS - 1, messages: [], instructions: 'base' });
		expect(r).toMatchObject({
			toolChoice: 'none',
			activeTools: [],
			instructions: `base\n\n${ANSWER_NOW}`
		});
	});
});

describe('money per turn', () => {
	const priced = (...costs: number[]) =>
		costs.map((c) => ({ content: [], providerMetadata: { gateway: { cost: String(c) } } }));

	it('answers without tools once the turn passes the soft limit', () => {
		const r = answerWhenDone({
			stepNumber: 1,
			steps: priced(0.06, TURN_COST.softUsd),
			messages: [],
			instructions: 'base'
		});
		expect(r).toMatchObject({ toolChoice: 'none', activeTools: [] });
	});

	it('leaves a cheap turn alone', () => {
		expect(
			answerWhenDone({ stepNumber: 1, steps: priced(0.01), messages: [], instructions: 'x' })
		).toEqual({});
	});

	it('ends the turn past the hard limit, and not before', () => {
		expect(STOP_WHEN).toContain(pastHardCost);
		expect(pastHardCost({ steps: priced(TURN_COST.hardUsd - 0.01) })).toBe(false);
		expect(pastHardCost({ steps: priced(0.15, 0.06) })).toBe(true);
	});
});

describe('lookupsAsText', () => {
	it('rewrites calls and results as text and drops reasoning', () => {
		const out = lookupsAsText([
			{ role: 'user', content: 'bus?' },
			{
				role: 'assistant',
				content: [
					{ type: 'reasoning', text: 'hmm' },
					{ type: 'text', text: 'Checking.' },
					{ type: 'tool-call', toolCallId: 'a', toolName: 'bus', input: { who: 'Kid1' } }
				]
			},
			{
				role: 'tool',
				content: [
					{
						type: 'tool-result',
						toolCallId: 'a',
						toolName: 'bus',
						output: { type: 'json', value: { next: '7:42' } }
					}
				]
			}
		]);
		expect(out).toEqual([
			{ role: 'user', content: 'bus?' },
			{ role: 'assistant', content: 'Checking.' },
			{ role: 'user', content: 'Lookup bus {"who":"Kid1"} returned: {"next":"7:42"}' }
		]);
	});
});

describe('QUIET_TOOLS', () => {
	it('lets a quiet turn read and edit lists, and nothing that reaches outside or makes noise', () => {
		expect([...QUIET_TOOLS].sort()).toEqual(
			['calendar', 'school_dates', 'ticktick', 'ticktick_add', 'ticktick_done'].sort()
		);
	});
});

describe('TURN_TIMEOUT', () => {
	it('bounds the whole turn, and a model that never starts or goes silent sooner', () => {
		expect(TURN_TIMEOUT.totalMs).toBeGreaterThan(TURN_TIMEOUT.firstChunkMs);
		expect(TURN_TIMEOUT.totalMs).toBeGreaterThan(TURN_TIMEOUT.chunkMs);
	});
});
