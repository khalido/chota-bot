/**
 * POST /api/agent/chat — streaming agent endpoint for the admin chat UI
 * (and the future kiosk takeover view + Telegram handler).
 *
 * Receives a `messages` array of UIMessages from `@ai-sdk/svelte`'s `Chat`
 * class and streams back a UI message stream produced by `chotaAgent`. The
 * agent's own `prepareCall` rebuilds the system prompt fresh on every
 * request (today's date + snapshot), so no extra wiring is needed here.
 */
import { createAgentUIStreamResponse } from 'ai';
import { chotaAgent } from '$lib/server/agent';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { messages } = (await request.json()) as { messages: unknown[] };
	return createAgentUIStreamResponse({
		agent: chotaAgent,
		uiMessages: messages
	});
};
