/**
 * chotaAgent — the single ToolLoopAgent backing every LLM call in chota.
 *
 * Everything that wants an LLM (Phase 3 Telegram handler, scratch admin
 * endpoints, future job loops) imports from here. Nothing else in the
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
 * outcome per invocation. Stream paths can wrap `.stream(...)` the same
 * way when they land.
 */
import { google } from '@ai-sdk/google';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { event } from '$lib/server/log';
import { buildSystemPrompt } from './prompts';
import { weatherTool } from './tools/weather';
import { calendarTool } from './tools/calendar';
import { ticktickTool } from './tools/ticktick';
import { tmdbTool } from './tools/tmdb';

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

/** UIMessage type for typed `useChat` / Telegram handlers (Phase 3). */
export type ChotaAgentUIMessage = InferAgentUIMessage<typeof chotaAgent>;

/**
 * Thin wrapper around `chotaAgent.generate(...)` that emits one
 * `agent.run` wide event per call. Pass through whatever generate
 * accepts; bring your own prompt or messages.
 */
export async function runAgent(args: Parameters<typeof chotaAgent.generate>[0]) {
	const ev = event('agent', 'run {model}', { model: MODEL });
	try {
		const result = await chotaAgent.generate(args);
		ev.set('tokens_in', result.totalUsage.inputTokens ?? 0)
			.set('tokens_out', result.totalUsage.outputTokens ?? 0)
			.set('steps', result.steps.length)
			.done();
		return result;
	} catch (err) {
		ev.fail(err);
		throw err;
	}
}

/** The resolved result of `chotaAgent.stream(...)` — exposes `fullStream`
 *  (typed tool-call + text-delta parts), `textStream`, `totalUsage`, `steps`. */
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
		const usage = await result.totalUsage;
		const steps = await result.steps;
		ev.set('tokens_in', usage.inputTokens ?? 0)
			.set('tokens_out', usage.outputTokens ?? 0)
			.set('steps', steps.length)
			.done();
		return result;
	} catch (err) {
		ev.fail(err);
		throw err;
	}
}
