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
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { event } from '$lib/server/log';
import { answerWhenDone, STOP_WHEN } from './loop';
import { buildSystemPrompt } from './prompts';
import { weatherTool } from './tools/weather';
import { calendarTool } from './tools/calendar';
import { z } from 'zod';
import { AskerSchema, savedTool, saveTool } from './tools/content';
import { ticktickAddTool, ticktickDoneTool, ticktickTool } from './tools/ticktick';
import { busTool } from './tools/bus';
import { choresTool } from './tools/chores';
import { schoolDatesTool, schoolDayTool } from './tools/school';
import { bookTool } from './tools/books';
import { titleInfoTool, watchIdeasTool } from './tools/tmdb';
import { volleyballTool } from './tools/volleyball';
import { webFetchTool, webSearchTool } from './tools/web';

export { describeChatError, EMPTY_REPLY } from './errors';
export type { ContentContext } from './tools/content';

/** Default model — AI Gateway slug. Swap to bench other providers (use the
 *  highest version available from `curl https://ai-gateway.vercel.sh/v1/models`). */
export const MODEL = 'deepseek/deepseek-v4.1-flash-fast';

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
	// Per call: who is asking, from the channel router (never the model). The
	// save/saved tools get it as their context; the admin chat sends none.
	callOptionsSchema: z.object({ asker: AskerSchema.optional() }).optional(),
	prepareCall: async ({ options, ...settings }) => ({
		...settings,
		instructions: await buildSystemPrompt(),
		toolsContext: { save: options?.asker ?? {}, saved: options?.asker ?? {} }
	}),
	toolsContext: { save: {}, saved: {} },
	// A hard step cap, and the last step answers without tools (see ./loop.ts).
	stopWhen: STOP_WHEN,
	prepareStep: answerWhenDone,
	tools: {
		weather: weatherTool,
		calendar: calendarTool,
		ticktick: ticktickTool,
		ticktick_add: ticktickAddTool,
		ticktick_done: ticktickDoneTool,
		bus: busTool,
		chores: choresTool,
		school_day: schoolDayTool,
		school_dates: schoolDatesTool,
		title_info: titleInfoTool,
		watch_ideas: watchIdeasTool,
		book: bookTool,
		volleyball: volleyballTool,
		save: saveTool,
		saved: savedTool,
		// AI Gateway's own web tools — work with any model (see tools/web.ts).
		web_search: webSearchTool,
		web_fetch: webFetchTool
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
