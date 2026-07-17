/**
 * chotaAgent — the single ToolLoopAgent backing every LLM call in chota.
 *
 * Everything that wants an LLM (the live Telegram handler, the /admin/agent
 * chat, future job loops) imports from here. Nothing else in the
 * repo should import `ai` or `zod` directly — keep the model + tool
 * surface area in one place.
 *
 * The system prompt is composed per-call by `buildSystemPrompt()`
 * (see `./prompts.ts`) — static identity from `soul.md` + a style guide
 * + today's Sydney date + a one-screen snapshot of calendar + family
 * list. Rebuilding every call is wasteful for the static parts; when
 * prompt-caching lands we'll split it into a cacheable head + per-call
 * tail.
 *
 * Wide-event logging: `runAgent` wraps `chotaAgent.generate(...)` in one
 * `agent.run` event so PostHog/OTel sees token usage + step count +
 * outcome per invocation; `runAgentStream` does the same for the
 * streaming path (Telegram + the admin chat).
 */
import { google } from '@ai-sdk/google';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { event } from '$lib/server/log';
import { buildSystemPrompt } from './prompts';
import { weatherTool } from './tools/weather';
import { calendarTool } from './tools/calendar';
import { ticktickTool } from './tools/ticktick';
import { tmdbTool } from './tools/tmdb';
import { volleyballTool } from './tools/volleyball';

/** Default model — AI Gateway slug. Swap to bench other providers (use the
 *  highest version available from `curl https://ai-gateway.vercel.sh/v1/models`). */
export const MODEL = 'google/gemini-3.5-flash';

export const chotaAgent = new ToolLoopAgent({
	id: 'chota',
	model: MODEL,
	// Reasoning is handled opportunistically: the Telegram thinking-block renders
	// any `reasoning-*` stream parts the model emits (provider-agnostic, SDK
	// built-in) and just shows tool status / "Thinking…" otherwise. We do NOT
	// force provider-specific thinking config (e.g. Gemini's `thinkingConfig`
	// `includeThoughts`) — keeps this clean across model swaps (GLM, etc.). If a
	// model needs a flag to emit thoughts, bake it into a model alias, not here.
	// `instructions` is unused at construction — `prepareCall` overrides
	// it with the freshly-composed system prompt on every call.
	prepareCall: async ({ ...settings }) => ({
		...settings,
		instructions: await buildSystemPrompt()
	}),
	tools: {
		weather: weatherTool,
		calendar: calendarTool,
		ticktick: ticktickTool,
		tmdb: tmdbTool,
		volleyball: volleyballTool,
		// Google Search grounding — Gemini's native web tool. Same-provider
		// tool (Gemini is trained on it), so search results + synthesised
		// answer come back in one response — no extra loop step needed.
		// Free under the Gemini API quota; routed via the existing
		// AI_GATEWAY_API_KEY without a separate Google key.
		// `google_search` is the required tool name — Gemini won't recognise
		// the grounding tool under any other key.
		google_search: google.tools.googleSearch({})
	}
});

/** UIMessage type for the typed `useChat` admin chat + Telegram handlers. */
export type ChotaAgentUIMessage = InferAgentUIMessage<typeof chotaAgent>;

/**
 * Sum the AI Gateway's per-step dollar cost off `providerMetadata.gateway.cost`
 * — null when the metadata is absent (non-gateway model, or the gateway didn't
 * price the call). Rides the `agent.run` wide event so PostHog can chart spend.
 */
function gatewayCost(steps: readonly { providerMetadata?: unknown }[]): number | null {
	let total = 0;
	let found = false;
	for (const s of steps) {
		const raw = (s.providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost;
		const n = typeof raw === 'string' ? Number(raw) : raw;
		if (typeof n === 'number' && Number.isFinite(n)) {
			total += n;
			found = true;
		}
	}
	return found ? total : null;
}

/**
 * Thin wrapper around `chotaAgent.generate(...)` that emits one
 * `agent.run` wide event per call. Pass through whatever generate
 * accepts; bring your own prompt or messages.
 */
export async function runAgent(args: Parameters<typeof chotaAgent.generate>[0]) {
	const ev = event('agent', 'run {model}', { model: MODEL });
	try {
		const result = await chotaAgent.generate(args);
		// v7: `usage` aggregates across steps (`totalUsage` is deprecated).
		ev.set('tokens_in', result.usage.inputTokens ?? 0)
			.set('tokens_out', result.usage.outputTokens ?? 0)
			.set('steps', result.steps.length);
		const cost = gatewayCost(result.steps);
		if (cost !== null) ev.set('cost_usd', cost);
		ev.done();
		return result;
	} catch (err) {
		ev.fail(err);
		throw err;
	}
}

/** The resolved result of `chotaAgent.stream(...)` — exposes `fullStream`
 *  (typed tool-call + text-delta parts), `textStream`, `usage`, `steps`. */
export type ChotaStreamResult = Awaited<ReturnType<typeof chotaAgent.stream>>;

/**
 * Streaming sibling of `runAgent`. Starts `chotaAgent.stream(...)`, hands the
 * whole stream result to `consume` (so the consumer can read `fullStream` for
 * tool-call / text parts — e.g. the Telegram Rich-Message streamer that shows a
 * "thinking" block while tools run), and emits the same `agent.run` wide event
 * once the caller has drained the stream — usage + steps are only final after
 * consumption. Observability stays here so callers just render.
 */
export async function runAgentStream(
	args: Parameters<typeof chotaAgent.stream>[0],
	consume: (result: ChotaStreamResult) => Promise<void>
) {
	const ev = event('agent', 'run {model}', { model: MODEL, mode: 'stream' });
	try {
		const result = await chotaAgent.stream(args);
		await consume(result);
		// v7: `usage` aggregates across steps (`totalUsage` is deprecated).
		const usage = await result.usage;
		const steps = await result.steps;
		ev.set('tokens_in', usage.inputTokens ?? 0)
			.set('tokens_out', usage.outputTokens ?? 0)
			.set('steps', steps.length);
		const cost = gatewayCost(steps);
		if (cost !== null) ev.set('cost_usd', cost);
		ev.done();
		return result;
	} catch (err) {
		ev.fail(err);
		throw err;
	}
}
