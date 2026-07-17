/**
 * Process-wide mutex for the single shared agent-browser instance.
 *
 * Two things drive agent-browser: the print screenshot path
 * (`print/snapshot.ts`) and the Sentral SAML login (`tools/sentral-login.ts`).
 * They share one headless browser, so overlapping runs clobber each other —
 * a `/print` tapped on Telegram mid-login kills the login's page, and two
 * concurrent logins interleave commands. Everything that talks to
 * agent-browser goes through `withBrowser()` so only one flow runs at a time.
 *
 * Plain promise chain, no timeout of its own — callers already bound their
 * work with exec timeouts, so a stuck entry can't wedge the chain forever.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withBrowser<T>(fn: () => Promise<T>): Promise<T> {
	const run = chain.then(fn);
	// Keep the chain alive after a failure; the caller still sees the rejection.
	chain = run.catch(() => {});
	return run;
}
