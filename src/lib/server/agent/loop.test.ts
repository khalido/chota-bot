import { describe, expect, it } from 'vitest';
import { ANSWER_NOW, MAX_STEPS, answerWhenDone, lookupsAsText } from './loop';

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
