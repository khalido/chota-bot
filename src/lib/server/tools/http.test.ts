import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText, responseError } from './http';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('responseError', () => {
	it("reads the service's own message from the common error shapes", async () => {
		expect(await responseError(json(403, { error: { status: 403, message: 'Forbidden' } }))).toBe(
			'403: Forbidden'
		);
		expect(
			await responseError(json(400, { error: 'invalid_client', error_description: 'Bad secret' }))
		).toBe('400: Bad secret');
		expect(await responseError(json(404, { message: 'Not found' }))).toBe('404: Not found');
		expect(await responseError(new Response('gateway down', { status: 502 }))).toBe(
			'502: gateway down'
		);
		expect(await responseError(new Response('', { status: 500 }))).toBe('500');
		expect(await responseError(new Response('x'.repeat(500), { status: 500 }))).toHaveLength(205);
	});
});

describe('fetchJson / fetchText', () => {
	it('returns the body on 2xx, passes headers, and sets a timeout', async () => {
		const fetch = vi.fn(async (..._args: unknown[]) => json(200, { ok: 1 }));
		vi.stubGlobal('fetch', fetch);
		expect(await fetchJson('https://x.test/a', { label: 'X', headers: { a: 'b' } })).toEqual({
			ok: 1
		});
		const init = fetch.mock.calls[0][1] as RequestInit;
		expect(init.headers).toEqual({ a: 'b' });
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(init).not.toHaveProperty('label');
	});

	it('throws "<label> <status>: <message>" on an error reply', async () => {
		vi.stubGlobal('fetch', async () => new Response('slow down', { status: 429 }));
		await expect(fetchText('https://x.test/a', { label: 'Open Library' })).rejects.toThrow(
			'Open Library 429: slow down'
		);
	});
});
