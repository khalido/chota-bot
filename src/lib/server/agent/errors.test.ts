import { describe, expect, it } from 'vitest';
import {
	APICallError,
	InvalidToolInputError,
	NoOutputGeneratedError,
	NoSuchToolError,
	RetryError
} from 'ai';
import { describeChatError, changedSomething, failureMessage, WRITE_DONE } from './errors';

const apiError = (statusCode: number, isRetryable: boolean) =>
	new APICallError({
		message: 'gateway said no',
		url: 'https://gateway.example/v1/chat',
		requestBodyValues: {},
		statusCode,
		isRetryable
	});

describe('describeChatError', () => {
	it('says to ask again on a provider outage, with the code', () => {
		const f = describeChatError(apiError(503, true));
		expect(f.kind).toBe('provider-503');
		expect(f.message).toContain('503');
		expect(f.message).toContain('again');
	});

	it('treats 429 as worth asking again even when the provider says otherwise', () => {
		expect(describeChatError(apiError(429, false)).message).toContain('again');
	});

	it('sends a dead key or empty budget to a parent, not back to the asker', () => {
		const f = describeChatError(apiError(401, false));
		expect(f.kind).toBe('provider-401');
		expect(f.message).toContain('Tell a parent');
	});

	it('names a bad tool call as the model’s mistake', () => {
		expect(describeChatError(new NoSuchToolError({ toolName: 'print' })).kind).toBe('no-such-tool');
		expect(
			describeChatError(
				new InvalidToolInputError({ toolName: 'calendar', toolInput: '{', cause: 'bad json' })
			).kind
		).toBe('tool-input');
	});

	it('falls back without throwing on anything else, keeping the detail for the log', () => {
		expect(describeChatError(new Error('boom')).kind).toBe('unknown');
		expect(describeChatError('a string').detail).toBe('a string');
		expect(describeChatError(apiError(500, true)).detail).toContain('gateway said no');
	});

	it('reads the gateway’s own errors by their status code', () => {
		// GatewayAuthenticationError is not an APICallError but carries statusCode.
		const gw = Object.assign(new Error('Invalid API key'), {
			name: 'GatewayAuthenticationError',
			statusCode: 401
		});
		expect(describeChatError(gw).message).toContain('Tell a parent');
	});

	it('unwraps retries and an empty stream to the provider error underneath', () => {
		const retried = new RetryError({
			message: 'failed after 3 attempts',
			reason: 'maxRetriesExceeded',
			errors: [apiError(503, true), apiError(503, true)]
		});
		expect(describeChatError(retried).kind).toBe('provider-503');
		const empty = new NoOutputGeneratedError({ cause: apiError(402, false) });
		const f = describeChatError(empty);
		expect(f.kind).toBe('provider-402');
		expect(f.detail).toContain('gateway said no');
	});
});

describe('a turn that ran out of time', () => {
	it('is its own kind, and says so', () => {
		const err = new Error('The operation timed out');
		err.name = 'TimeoutError';
		expect(describeChatError(err)).toMatchObject({
			kind: 'timeout',
			message: expect.stringMatching(/took too long/)
		});
	});
});

describe('failureMessage', () => {
	const busy = describeChatError(Object.assign(new Error('x'), { statusCode: 503 }));

	it('is the plain message when nothing had been done', () => {
		expect(failureMessage(busy, [])).toBe(busy.message);
		expect(failureMessage(busy, ['weather', 'calendar'])).toBe(busy.message);
	});

	it('says what was already done instead of "ask again"', () => {
		const said = failureMessage(busy, ['weather', 'ticktick_add', 'ticktick_add']);
		expect(said).toBe(
			'The AI service is busy or down (503). Before that I had already added to a list, so check before asking again.'
		);
		expect(said).not.toMatch(/Ask again/);
	});

	it('names each kind of change once', () => {
		expect(failureMessage(busy, ['music_play', 'announce'])).toMatch(
			/already started music and made an announcement,/
		);
	});
});

describe('WRITE_DONE', () => {
	it('covers every tool the agent has that changes something', async () => {
		// A new write tool must be added here, or a failed turn tells the person to
		// ask again after it ran, and a quiet turn would not show its reaction.
		expect(Object.keys(WRITE_DONE).sort()).toEqual(
			['announce', 'music_control', 'music_play', 'save', 'ticktick_add', 'ticktick_done'].sort()
		);
	});
});

describe('changedSomething', () => {
	it.each([
		['ticktick_add', { added: 'milk', list: 'Shopping' }],
		['ticktick_done', { done: ['milk'] }],
		['music_play', { ok: true, playing: 'jazz' }],
		['music_control', { ok: true }],
		['announce', { said: true, text: 'dinner' }],
		['save', { saved: 12, title: 'A page' }]
	])('%s that worked counts', (tool, output) => {
		expect(changedSomething(tool, output)).toBe(true);
	});

	it.each([
		['ticktick_add', { error: "couldn't add to Shopping: timeout" }],
		['ticktick_done', { done: [] }],
		['music_play', { show: 'A Pod', episodes: [], next: 'Ask which one' }],
		['music_control', { error: 'the house speaker is offline' }],
		['announce', { said: false, reason: "it's quiet hours" }],
		['weather', { tempC: 20 }],
		['ticktick_add', 'added']
	])('%s that failed, asked back or only read does not', (tool, output) => {
		expect(changedSomething(tool, output)).toBe(false);
	});
});
