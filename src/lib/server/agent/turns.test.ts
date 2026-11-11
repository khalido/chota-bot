import { describe, expect, it } from 'vitest';
import { runNote, toolParts, turnStats } from './turns';

const call = (id: string, name = 'bus') => ({
	type: 'tool-call',
	toolCallId: id,
	toolName: name,
	input: { q: 1 }
});

describe('toolParts', () => {
	it('joins each call with its result, across steps', () => {
		const parts = toolParts([
			{ content: [{ type: 'text', text: 'hi' }, call('a')] },
			{ content: [{ type: 'tool-result', toolCallId: 'a', output: { next: '8:12' } }] }
		]);
		expect(parts).toEqual([
			{ id: 'a', name: 'bus', input: { q: 1 }, status: 'ok', output: { next: '8:12' } }
		]);
	});

	it('records a tool error', () => {
		const parts = toolParts([
			{ content: [call('a'), { type: 'tool-error', toolCallId: 'a', error: new Error('down') }] }
		]);
		expect(parts[0]).toMatchObject({ status: 'error', output: 'Error: down' });
	});

	it('records a tool that returned { error } as failed, not ok', () => {
		const [part] = toolParts([
			{
				content: [
					call('a', 'ticktick_add'),
					{ type: 'tool-result', toolCallId: 'a', output: { error: "couldn't add: timeout" } }
				]
			}
		]);
		expect(part).toMatchObject({ status: 'error', output: { error: "couldn't add: timeout" } });
	});

	it('keeps a call that never got a result, as an error', () => {
		expect(toolParts([{ content: [call('a')] }])[0]).toMatchObject({
			status: 'error',
			output: null
		});
	});

	it('marks a cut result instead of hiding the cut', () => {
		const output = 'x'.repeat(200_001);
		const [part] = toolParts([
			{ content: [call('a'), { type: 'tool-result', toolCallId: 'a', output }] }
		]);
		expect(part.truncated).toBe(true);
		expect(String(part.output)).toHaveLength(200_000);
	});
});

describe('turnStats', () => {
	it('reads the model, the provider, tokens, cache and summed cost', () => {
		const stats = turnStats([
			{
				content: [],
				providerMetadata: { gateway: { cost: '0.01' } },
				usage: { inputTokens: 60, outputTokens: 4, inputTokenDetails: { cacheReadTokens: 40 } }
			},
			{
				content: [],
				response: { modelId: 'deepseek/x' },
				providerMetadata: { gateway: { cost: '0.02', routing: { finalProvider: 'baseten' } } },
				usage: { inputTokens: 40, outputTokens: 6 }
			}
		]);
		expect(stats).toMatchObject({
			model: 'deepseek/x',
			provider: 'baseten',
			steps: 2,
			tokensIn: 100,
			tokensOut: 10,
			cachedTokens: 40
		});
		expect(stats.costUsd).toBeCloseTo(0.03);
	});

	it('leaves unknown numbers null rather than zero', () => {
		expect(turnStats([{ content: [] }])).toMatchObject({
			model: null,
			provider: null,
			tokensIn: null,
			cachedTokens: null,
			costUsd: null
		});
	});
});

describe('runNote', () => {
	it('names each tool and its outcome', () => {
		const parts = [
			{ name: 'bus', status: 'ok' as const },
			{ name: 'calendar', status: 'error' as const }
		];
		expect(runNote(parts, null)).toBe('[ran tools: bus (ok), calendar (failed)]');
		expect(runNote(parts, 'network')).toBe(
			'[ran tools: bus (ok), calendar (failed); then the run failed]'
		);
	});

	it('says "no change" for a write that changed nothing', () => {
		const parts = [
			{
				name: 'ticktick_add',
				status: 'ok' as const,
				input: { title: 'milk' },
				output: { alreadyOnList: 'milk', list: 'shopping' }
			},
			{
				name: 'ticktick_done',
				status: 'ok' as const,
				input: { titles: ['x'] },
				output: { done: [] }
			},
			{
				name: 'ticktick_add',
				status: 'ok' as const,
				input: { title: 'eggs' },
				output: { error: 'x' }
			}
		];
		expect(runNote(parts, null)).toBe(
			'[ran tools: ticktick_add {"title":"milk"} (no change), ticktick_done {"titles":["x"]} (no change), ticktick_add {"title":"eggs"} (failed)]'
		);
	});

	it('says what a write tool was asked to do, and nothing for a read', () => {
		const parts = [
			{ name: 'ticktick', status: 'ok' as const, input: { list: 'shopping' } },
			{ name: 'ticktick_add', status: 'ok' as const, input: { list: 'shopping', title: 'milk' } }
		];
		expect(runNote(parts, null)).toBe(
			'[ran tools: ticktick (ok), ticktick_add {"list":"shopping","title":"milk"} (ok)]'
		);
	});
});
