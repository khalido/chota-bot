# Agent

[Vercel AI SDK](https://ai-sdk.dev/docs) (`ai` v6) is chota's **sole** agent runtime. Pi-coding-agent was originally in the plan but dropped — our agent calls typed tool wrappers and writes notes, it never writes/runs code. One SDK, one mental model.

> **This doc tracks shipped code.** The agent is built and chat-debuggable at `/admin/agent`. The source of truth is `src/lib/server/agent/` + its `CLAUDE.md`; this doc is the reasoning behind it. When the two disagree, the code wins — fix the doc.
>
> **Before touching agent code, load the `ai-sdk` skill** (`.agents/skills/ai-sdk/`). Its first rule: _do not trust internal knowledge of the AI SDK_ — the API moved through v5→v6 and training data is stale. Verify against `node_modules/ai/docs/` and **always fetch live model IDs from the gateway** (`curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'`), never from memory.

## Stack decision

| Concern          | Choice                                                                     | Why                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime          | `ai` v6 — the **`ToolLoopAgent`** class                                    | One reusable agent definition for kiosk UI streaming, Telegram, and job loops. Handles the tool loop, context, and stop conditions for us. |
| Provider routing | AI Gateway (plain model-slug string, e.g. `'google/gemini-3.5-flash'`)     | One `AI_GATEWAY_API_KEY`, per-task model swap, spend caps, provider fallback. No per-provider SDK except Groq Whisper (voice, Phase 3).    |
| Default model    | a fast/cheap Gemini Flash slug (**fetch the current ID from the gateway**) | Good enough for tool-calling family jobs; cheap enough to run often. Shipped value lives in `MODEL` in `agent/index.ts`.                   |
| Heavy job model  | a stronger slug, dreaming/consolidation only                               | Reasoning-heavy nightly pass; worth the cost once a day.                                                                                   |
| Memory           | not built yet — custom JSONL tool when it lands                            | See §Memory below for the three options + our lean.                                                                                        |
| Sandbox          | None                                                                       | Tools are typed wrappers, not arbitrary code execution. See §Sandboxing in `plan.md`.                                                      |

## The one primitive: `ToolLoopAgent`

We define **one** agent instance (`chotaAgent`) and import it everywhere an LLM is needed. This is the AI SDK's recommended shape — define once, reuse, type-safe.

```ts
// src/lib/server/agent/index.ts  (abridged — read the real file)
import { google } from '@ai-sdk/google';
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { buildSystemPrompt } from './prompts';
import { weatherTool } from './tools/weather';
// …calendar, ticktick, tmdb

export const MODEL = 'google/gemini-3.5-flash'; // gateway slug — verify against the gateway

export const chotaAgent = new ToolLoopAgent({
	id: 'chota',
	model: MODEL,
	// `instructions` is rebuilt per call by prepareCall (see below) — the
	// value passed at construction is overridden.
	prepareCall: async ({ ...settings }) => ({
		...settings,
		instructions: await buildSystemPrompt()
	}),
	tools: {
		weather: weatherTool,
		calendar: calendarTool,
		ticktick: ticktickTool,
		tmdb: tmdbTool,
		// Gemini's native web grounding — same-provider tool, so search + answer
		// come back in one step. `google_search` is the required key name.
		google_search: google.tools.googleSearch({})
	}
});

export type ChotaAgentUIMessage = InferAgentUIMessage<typeof chotaAgent>;
```

Use it three ways:

- **`chotaAgent.generate({ prompt })`** — one-shot. Returns `{ text, steps, totalUsage, … }`. The SDK auto-loops tool calls; you never write `while (hasToolCalls)`.
- **`chotaAgent.stream({ prompt })`** — streaming. Returns `{ textStream, … }` for the kiosk `useChat` and the Telegram `sendRichMessageDraft` helper.
- **`createAgentUIStreamResponse({ agent, uiMessages })`** — a ready-made SvelteKit/route response for the chat UI.

### `prepareCall` builds the prompt per call

`buildSystemPrompt()` (`prompts.ts`) composes four layers fresh on every call: **SOUL** (identity/voice from `soul.md`), **STYLE** (audience, brevity, tool-use cues), **TODAY** (Sydney date so the model can resolve "next Monday"), **SNAPSHOT** (today's calendar + family-list state, best-effort — one failed fetch drops one line, not the prompt). Rebuilding the static parts every call is wasteful; when prompt-caching lands, split SOUL+STYLE (cacheable head) from TODAY+SNAPSHOT (per-call tail) as `SystemModelMessage[]`.

For runtime inputs that should be type-checked (e.g. "which family member is this for", a chat session id), use **`callOptionsSchema` + `prepareCall({ options })`** rather than threading globals — `options` becomes a required, typed argument to `generate()`/`stream()`.

## The `runAgent()` wrapper — observability, not control flow

`runAgent()` is a _thin_ wrapper around `chotaAgent.generate(...)` whose only job is to emit one `agent.run` wide event (model, tokens in/out, steps, outcome, duration) to LogTape → OTel/PostHog. It is **not** a re-implementation of the loop — the `ToolLoopAgent` already owns that.

```ts
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
```

Every surface (Telegram handler, job loop, admin endpoint) calls `runAgent()` so cost/usage is captured in one place. Streaming paths can wrap `.stream(...)` the same way when they land.

## Tools — current shape (v6)

One file per tool in `agent/tools/`, basename matching the data lib it wraps in `$lib/server/tools/`. The tool file adds the LLM-facing `description` + `inputSchema` + any response shaping; the data lib owns the fetch, caching, and stale-ok behaviour.

```ts
import { tool } from 'ai';
import { z } from 'zod';

export const memory = tool({
	description: 'Read, write, search, or delete entries in long-term memory.',
	inputSchema: z.object({
		// NOT `parameters` — that's the v3/v4 name
		op: z.enum(['search', 'add', 'delete', 'update']),
		query: z.string().optional(),
		tags: z.array(z.string()).optional(),
		content: z.string().optional(),
		id: z.string().optional()
	}),
	execute: async ({ op, query, tags, content, id }, { abortSignal }) => {
		// propagate abortSignal to any fetch inside; return a small scalar object
	}
});
```

Rules (also in `agent/CLAUDE.md`):

- **`inputSchema`, not `parameters`** — v5 rename, silently mistypes if wrong.
- **`execute` returns a small, scalar-shaped object** — slice/shape before returning. The LLM sees this back as a tool result; smaller is cheaper.
- **`execute` receives `{ abortSignal }`** as its second arg — propagate it to fetches so the agent's timeout actually cancels work.
- **Argument-free tools use `inputSchema: z.object({})`.**
- **Tool errors don't throw (v5+ change).** A thrown error in `execute` lands as a `tool-error` content part inside `result.steps`, not as a caught exception. Inspect explicitly:

  ```ts
  const toolErrors = result.steps.flatMap((s) =>
  	s.content
  		.filter((p) => p.type === 'tool-error')
  		.map((p) => ({ toolName: p.toolName, error: p.error }))
  );
  ```

- **Don't reach for the DB / external APIs directly from a tool** — call the matching `$lib/server/tools/` lib.

## Loop control

`ToolLoopAgent` defaults to `stopWhen: stepCountIs(20)` — a runaway-loop backstop. Tune per need:

- `stepCountIs(n)` — hard step cap.
- `hasToolCall('name')` — stop once a specific tool fires.
- `isLoopFinished()` — no cap; let the model stop naturally. **Use with caution** — unbounded cost.
- Custom `StopCondition` — e.g. a token-budget guard that sums `steps[].usage` and stops past a cost threshold.

Combine with an array (stops on the first to match). For wall-clock safety pass `abortSignal: AbortSignal.timeout(ms)` to `generate()` and compose a caller signal with `AbortSignal.any([caller, timeout])`. `prepareStep` can swap model/tools/messages between steps (e.g. cheap model for early steps, stronger for synthesis) — reach for it only when a single model genuinely underperforms.

## Memory (when we land it)

The AI SDK documents [three memory approaches](https://ai-sdk.dev/docs/agents/memory):

| Approach                  | Effort | Lock-in            | Notes                                                                                                                                                                                |
| ------------------------- | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Provider-defined tool** | Low    | Yes (per provider) | e.g. Anthropic's `memory_20250818` tool — Claude is _trained_ to use it; you implement `execute` (view/create/str_replace/insert/delete/rename) against any backend. Tied to Claude. |
| **Memory provider**       | Low    | Yes (per service)  | Letta / Mem0 wrap an external memory service behind the SDK interface. Operational sidecar/account.                                                                                  |
| **Custom tool**           | High   | **None**           | One `tool()` with an `op` discriminator over our own JSONL store. Full control, no lock-in.                                                                                          |

**Our lean: the custom tool**, per the [Vercel custom-memory cookbook](https://ai-sdk.dev/cookbook/guides/custom-memory-tool) — but keep the Anthropic memory tool in mind if we ever pin to Claude, since "trained to use it" is a real quality edge. Single JSONL file `data/memory/family.jsonl`:

```jsonl
{
	"id": "mem_abc",
	"created": "2026-05-11T03:00:00Z",
	"tags": [
		"kid2",
		"sport"
	],
	"content": "…"
}
```

Structured records give stable IDs (clean edits), free metadata (timestamps, tags), atomic appends, and lossless tag filtering; the `content` field is still free prose. Held back from Phase 2 because nightly rewrites are the highest-corruption-risk path — settle the single-writer lock + injection boundaries first (see `plan.md` Phase 3).

## Sessions: simplified, not raw

`generate()` returns a `steps` array with full message history — storing it raw is expensive and noisy to feed back to the dreaming pass. After each `runAgent()` call, extract a 5-field record and append to today's session log:

```jsonl
// data/memory/sessions/2026-05-11.jsonl
{"id":"ses_abc","at":"…","job":"weekly-news","input":"Search news for…","tools":{"google_search":3,"ticktick":1},"output":"Added 3 articles","tokens":{"in":4800,"out":720},"steps":7,"errors":[]}
```

`tools` is **counts only** (`{ "google_search": 3 }`), not arguments — those are noise at consolidation time. Build the counts by walking `result.steps[].content` for `tool-call` parts. The simplification belongs inside `runAgent()` so callers don't think about session logging. ~200 chars/session vs 10K+ raw.

## Dreaming — Anthropic's "never modify the input" pattern

Inspired by [Anthropic's Dreams pattern](https://platform.claude.com/docs/en/managed-agents/dreams): a dream reads the existing memory + recent session summaries and writes a _fresh, reorganized_ store — duplicates merged, stale entries replaced, new insights surfaced. **The input store is never modified**, so a bad output is discarded, not catastrophic. This is the key safety property (Sonnet rewriting `family.jsonl` was flagged as our highest-corruption-risk operation).

Implementation:

1. **03:00 Sydney** — `dreaming.ts` job fires.
2. **Read inputs (don't touch):** `family.jsonl` + last 1–2 days of session logs.
3. **Write `family.jsonl.new`** via the heavy model (`stopWhen: stepCountIs(15)`), `memory.*` tools pointed at the `.new` file.
4. **Atomic swap on success:** `mv family.jsonl.new family.jsonl` (POSIX rename is atomic).
5. **On failure:** leave `.new` for inspection, alert in logs, original untouched.
6. **Archive:** session logs >7 days gzipped to `archive/` (auditable, not deleted).

Dreaming prompt: DEDUPE / PRUNE / SHARPEN / ADD / KEEP-if-unsure, biased toward retention; emit a one-paragraph change summary that becomes a morning-print line ("**Memory updated**: 3 new facts about Kid2, removed 2 stale events"). We keep the holistic rewrite (not model-emitted ops) because the atomic-swap makes it safe and the model reasons better over the whole file.

## Hardening — mandatory from day one

1. **`stopWhen`** on every agent (the default `stepCountIs(20)` already applies — lower it for cheap jobs).
2. **`AbortSignal.timeout(ms)`** wall-clock cap passed to `generate()`/`stream()`.
3. **Per-tool fetch timeouts** in the data libs (`AbortSignal.timeout(10_000)`), wired through the tool's `{ abortSignal }`.
4. **Inspect tool errors** — they're `tool-error` parts in `steps`, not thrown.
5. **Log cost per call** — `result.totalUsage` is always present; `runAgent()` already emits it.
6. **`AbortSignal.any([caller, timeout])`** to compose a caller signal with the internal timeout.

Without these: token-burning loops (no `stopWhen`), wedged ticks (no timeout), silent corruption (unread tool errors).

## Consumers

- **`/admin/agent`** — chat UI for debugging the agent (built).
- **Telegram** (Phase 3, planned) — `message:text` → `runAgent({ prompt })` → reply; streaming via `chotaAgent.stream()` → `sendRichMessageDraft`. See [`docs/telegram.md`](telegram.md).
- **Jobs** (planned) — the morning-brief closing line is the first agent-driven job; a job calls `runAgent()` with job-specific tags. See [`docs/jobs.md`](jobs.md).

## Gotchas (v6)

- **`inputSchema` not `parameters`** (silent mistype).
- **`CoreMessage` → `ModelMessage`**, **`convertToCoreMessages` → `convertToModelMessages`** (matter only when bridging UI ↔ server).
- **Plain model-slug strings auto-route through AI Gateway** when `AI_GATEWAY_API_KEY` is set — no `@ai-sdk/gateway` import needed. `@ai-sdk/google` is imported only for the native `google_search` grounding tool, not for model routing.
- **Don't hardcode model IDs from memory** — fetch current ones from the gateway.
- **Provider-defined tools require a fixed key name** — `google_search` for Gemini grounding; the model won't recognise the tool under any other key.

## Future: Vercel Sandbox + bash-tool

If we ever want jobs where the agent writes + runs code (research that iterates faster in code than in N LLM calls), evaluate [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) + [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool). Deferred — our typed tool wrappers cover everything today.
