/**
 * POST /api/agent/chat — streaming agent endpoint for the admin chat UI
 * (and the future kiosk takeover view + Telegram handler).
 *
 * Receives a `messages` array of UIMessages from `@ai-sdk/svelte`'s `Chat`
 * class and streams back a UI message stream produced by `chotaAgent`. The
 * agent's own `prepareCall` rebuilds the system prompt fresh on every
 * request (today's date + snapshot), so no extra wiring is needed here.
 */
import { error } from '@sveltejs/kit';
import { createAgentUIStreamResponse } from 'ai';
import { chotaAgent } from '$lib/server/agent';
import type { RequestHandler } from './$types';

// Auth lives in hooks.server.ts (adminEmails guard); this is just a sanity
// cap so a runaway client can't feed the model an unbounded history.
const MAX_MESSAGES = 100;

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { messages?: unknown[] } | null;
	const messages = body?.messages;
	if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
		error(400, 'messages must be a non-empty array of at most 100 items');
	}
	return createAgentUIStreamResponse({
		agent: chotaAgent,
		uiMessages: messages
	});
};
