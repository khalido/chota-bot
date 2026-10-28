import { describe, expect, it } from 'vitest';
import {
	APICallError,
	InvalidToolInputError,
	NoOutputGeneratedError,
	NoSuchToolError,
	RetryError
} from 'ai';
import { describeChatError } from './errors';

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
