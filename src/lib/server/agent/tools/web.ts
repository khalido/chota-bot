/**
 * web agent-tools — search the web, and read a page the model already has a
 * URL for. Both run inside AI Gateway (provider-executed), so they work with
 * any model and bill to the gateway key; there's no `execute` here.
 *
 * Kept behind our own names (`web_search`, `web_fetch`) so the backend can
 * change without touching the prompt or the Telegram status labels — e.g.
 * our own fetch lib, or Exa's contents API, once Browserbase Fetch falls
 * short (no login pages, no JS rendering).
 */
import { gateway } from 'ai';

/** Exa search, $7 per 1,000. Highlights are short per-result excerpts — far
 *  fewer tokens than full page text, and enough for a one-sentence answer. */
export const webSearchTool = gateway.tools.exaSearch({
	numResults: 5,
	userLocation: 'AU',
	contents: { highlights: true }
});

/** Browserbase Fetch: one URL → Markdown. Format and proxies are pinned so
 *  the model can't raise the per-call price (markdown = $4 per 1,000; proxies
 *  would add $3). No JS execution — static pages only. */
export const webFetchTool = gateway.tools.browserbaseFetch({
	format: 'markdown',
	allowRedirects: true,
	proxies: false
});
