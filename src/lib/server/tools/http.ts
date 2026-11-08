/**
 * The fetch boilerplate the tools share: a timeout on every request, and one
 * error shape for a non-2xx reply — "<label> <status>: <the service's message>".
 * Callers that need the raw reply on an error (Sentral's redirect check,
 * Spotify's 401/429 retry) use plain fetch and `responseError`.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export type FetchOptions = RequestInit & {
	/** Names the service in the error: "TMDB", "Open Library". */
	label: string;
	timeoutMs?: number;
};

/** Fetch with a timeout; throws on a non-2xx reply, so the caller only sees OK responses. */
export async function fetchOk(
	url: RequestInfo | URL,
	{ label, timeoutMs = DEFAULT_TIMEOUT_MS, ...init }: FetchOptions
): Promise<Response> {
	const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
	if (!res.ok) throw new Error(`${label} ${await responseError(res)}`);
	return res;
}

/** `fetchOk`, then the body as JSON. */
export async function fetchJson<T>(url: RequestInfo | URL, opts: FetchOptions): Promise<T> {
	return (await (await fetchOk(url, opts)).json()) as T;
}

/** `fetchOk`, then the body as text. */
export async function fetchText(url: RequestInfo | URL, opts: FetchOptions): Promise<string> {
	return (await fetchOk(url, opts)).text();
}

/**
 * "403: <the service's own message>". Reads the common JSON error bodies —
 * `{ error: { message } }` (Google, Spotify's Web API), `{ error, error_description }`
 * (OAuth token endpoints), `{ message }` — else the first 200 characters of the body.
 */
export async function responseError(res: Response): Promise<string> {
	const text = await res.text().catch(() => '');
	try {
		const body = JSON.parse(text) as {
			error?: { message?: string } | string;
			error_description?: string;
			message?: string;
		};
		const message =
			typeof body.error === 'object'
				? body.error.message
				: (body.error_description ?? body.error ?? body.message);
		if (message) return `${res.status}: ${message}`;
	} catch {
		// not JSON: fall through to the raw text
	}
	return `${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
}
