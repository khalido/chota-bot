# Agent

[Vercel AI SDK](https://ai-sdk.dev/docs) (`ai` v7) is chota's **sole** agent runtime. Pi-coding-agent was originally in the plan but dropped — our agent calls typed tool wrappers and writes notes, it never writes/runs code. One SDK, one mental model.

> **This doc tracks shipped code.** The agent is built and chat-debuggable at `/admin/agent`. The source of truth is `src/lib/server/agent/` + its `CLAUDE.md`; this doc is the reasoning behind it. When the two disagree, the code wins — fix the doc.
>
> **Before touching agent code, load the `ai-sdk` skill** (`.agents/skills/ai-sdk/`). Its first rule: _do not trust internal knowledge of the AI SDK_ — the API moved through v5→v7 and training data is stale. Verify against `node_modules/ai/docs/` and **always fetch live model IDs from the gateway** (`curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '.data[].id'`), never from memory.

## Stack decision

| Concern          | Choice                                                                           | Why                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime          | `ai` v7 — the **`ToolLoopAgent`** class                                          | One reusable agent definition for kiosk UI streaming, Telegram, and job loops. Handles the tool loop, context, and stop conditions for us.    |
| Provider routing | AI Gateway (plain model-slug string, e.g. `'deepseek/deepseek-v4.1-flash-fast'`) | One `AI_GATEWAY_API_KEY`, per-task model swap, spend caps, provider fallback. No per-provider SDK except Groq Whisper (voice, Phase 3).       |
| Default model    | a fast model (**fetch the current ID from the gateway**)                         | Speed over raw capability for a family chat bot; skills and tools carry the common tasks. Shipped value lives in `MODEL` in `agent/index.ts`. |
| Heavy job model  | a stronger slug, dreaming/consolidation only                                     | Reasoning-heavy nightly pass; worth the cost once a day.                                                                                      |
| Memory           | not built yet — custom JSONL tool when it lands                                  | See §Memory below for the three options + our lean.                                                                                           |
| Sandbox          | None                                                                             | Tools are typed wrappers, not arbitrary code execution. See §Sandboxing in `plan.md`.                                                         |

## The one primitive: `ToolLoopAgent`

We define **one** agent instance (`chotaAgent`) and import it everywhere an LLM is needed. This is the AI SDK's recommended shape — define once, reuse, type-safe.

```ts
// src/lib/server/agent/index.ts  (abridged — read the real file)
import { ToolLoopAgent, type InferAgentUIMessage } from 'ai';
import { buildSystemPrompt } from './prompts';
import { weatherTool } from './tools/weather';
// …calendar, ticktick, tmdb

export const MODEL = 'deepseek/deepseek-v4.1-flash-fast'; // gateway slug — verify against the gateway

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
		// AI Gateway's web tools (tools/web.ts) — run gateway-side, any model.
		web_search: webSearchTool, // Exa, highlights
		web_fetch: webFetchTool // Browserbase Fetch → Markdown
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

Every surface (Telegram handler, job loop, admin endpoint) calls `runAgent()` so cost/usage is captured in one place.

`runAgentStream(args, consume)` is the **shipped** streaming sibling: it starts `chotaAgent.stream(...)`, hands the whole stream result to `consume` (so the consumer can read `fullStream` for tool-call + reasoning parts), and emits the same `agent.run` wide event after the stream drains. The Telegram bot uses it to render a Bot API 10.1 Rich Message — a `<tg-thinking>` block while tools run plus the model's reasoning **opportunistically** (we render `reasoning-*` parts if a model emits them but do **not** force provider thinking config like Gemini's `thinkingConfig`, so a model swap stays clean), then the streamed answer.

### What to capture for analysis

The result carries more than tokens. Worth keeping:

- **`result.response.modelId`** — the model that _actually_ served the request. AI Gateway can fall back to a different provider/model than requested, so this is ground truth and ≠ the `MODEL` const. **Keep it.**
- `result.totalUsage` (input/output tokens, cached/reasoning detail), `result.finishReason`, `result.steps.length`.
- Skip `providerMetadata` (niche for now).

Two homes: the `agent.run` **wide event** (LogTape → OTel/PostHog) is the analytics layer — enrich it with the actual `response.modelId` + `finishReason`; the `chat_message.metadata` JSON blob can carry a compact `{ model, in, out, finishReason, steps }` per assistant row for at-a-glance inspection in Drizzle Studio. _(Not yet wired — see Future / worklog.)_

## Conversation history — light table, not a session transcript

Shipped: a `chat_message` table (`db/chat.schema.ts`). Per turn the Telegram handler records the user message + the final reply **text only** — tool calls and thinking are scrubbed (their cost rides the wide event). Every message is kept; the last 50 (~25 exchanges, a few thousand tokens) go back to the model as context each turn (was 12 until 2026-10-16). Helpers live in `agent/history.ts` (`loadHistory`, `appendMessage`, `newTurnId`). Columns (`id`, `chatId`, `turnId`, `role`, `content`, `createdAt`, `metadata`) — `turnId` groups a user+assistant exchange; `metadata` is a JSON escape hatch. Compression (summarise + prune old turns) is deferred until volume warrants.

**Compaction (2026-10-16):** the context window is the text of the last 50 messages — tool calls and their results are never stored, which is the bulk of what the [compaction guide](https://ai-sdk.dev/cookbook/guides/agent-context-compaction) trims. Replies are short, and family facts live in memory, not history. So: nothing to build yet. When a long chat needs it — mostly the family group — summarise turns older than the window into one short message, per chat, and let durable facts go to memory via the inbox. Group history is per chat ID, so the group never shares context with a 1-to-1 chat.

> **Design principle (locked June 2026):** what defines the agent is `soul.md` (identity) + a well-maintained **memory store**. Messages are just light recent context. Full "sessions" — rich transcripts with every tool call + thought — are low-value and get messy fast, so we deliberately don't store them. Optimise soul + memory; keep history thin.

## Agent organization — one now, more later

Today there's **one** `ToolLoopAgent` (`agent/index.ts`). As agents are added we keep it flat and composition-first — **not** folder-per-agent (that's eve's multi-tenant shape; chota is one app with a few cooperating agents sharing capabilities):

- **Shared `tools/` + (later) `skills/` libraries.** Each agent is a thin definition picking `model` + `instructions` + a _subset_ of tools + a _subset_ of skills. No per-agent tool/skill folders — select from the shared library.
- **New agents are one file each** — e.g. `agent/dreaming.ts` (system-launched nightly memory consolidation: Sonnet, memory tools only, a _task prompt_, no skills).
- **soul vs instructions:** the main agent has `soul.md` (personality/voice — what makes it _Chota_). A single-purpose job agent has _instructions_ (a task prompt). Don't give every agent a personality.

### Subagents — the book-agent pattern (v7)

The user always talks to the **main** agent; it can delegate to a subagent that does focused work and returns a result (e.g. a `book` subagent: search → read → summarise → links). Any agent (including `dreaming`) can serve as a subagent of the main one. Two ways:

- **Today:** "agent-as-tool" — a tool whose `execute` runs a second `ToolLoopAgent.generate()` and returns its summary (~20 lines). (v7 ships native subagents; not adopted yet — see Gotchas.)
- **v7 (the plan):** the AI SDK's native [subagents](https://ai-sdk.dev/v7/docs/agents/subagents) primitive. **We'll wait for v7-beta to mature, then upgrade and roll subagents out on v7** — same shape, less hand-rolling.

## Skills — deferred, format decided

Skills are markdown **procedures/knowledge** the agent loads on demand — distinct from tools (typed functions). The AI SDK has **no native skills** concept (it's a higher layer — [eve](https://vercel.com/eve), Claude's harness); our `ToolLoopAgent` is where we'd wire it. Researched against eve + the [agentskills.io](https://agentskills.io) spec; decided shape:

- **Stage 1 (first):** flat `agent/skills/<name>.md` — frontmatter `description` (the trigger hint, listed in the system prompt) + a markdown body. Identity = filename. A `load_skill` tool returns the body (frontmatter stripped). Cache-friendly: only names + descriptions sit in the prompt; bodies load on demand. No sandbox — FS reads.
- **Stage 2:** graduate to `skills/<name>/SKILL.md` + `references/*.md` (pulled on demand) when a skill grows.
- **Stage 3 — `scripts/` deferred.** Skill scripts need a sandbox/bash runtime (both agentskills.io and eve assume one; eve never auto-runs them). Not appropriate for a family kiosk now; **revisit in the v7 era** (interesting sandbox products are emerging). The loader ignores `scripts/` if present.
- Skills mostly belong to the **main** conversational agent; single-purpose job agents are prompt-driven. **Skip:** TS/module skills, dynamic skills, `allowed-tools` enforcement, per-agent scoping.

## Tools — current shape (v7)

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

> **Superseded 2026-10-15** by [`memory.md`](memory.md): a markdown home folder with git history instead of a JSONL file. The approach comparison below still holds (custom tools, no lock-in).

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

## Session logs for dreaming — simplified, not raw

> Distinct from the conversation history above: that's the chat context table; **this** is a per-_job-run_ summary log that feeds the dreaming pass. Still planned, not built.

`generate()` returns a `steps` array with full message history — storing it raw is expensive and noisy to feed back to the dreaming pass. After each `runAgent()` call, extract a 5-field record and append to today's session log:

```jsonl
// data/memory/sessions/2026-05-11.jsonl
{"id":"ses_abc","at":"…","job":"weekly-news","input":"Search news for…","tools":{"google_search":3,"ticktick":1},"output":"Added 3 articles","tokens":{"in":4800,"out":720},"steps":7,"errors":[]}
```

`tools` is **counts only** (`{ "google_search": 3 }`), not arguments — those are noise at consolidation time. Build the counts by walking `result.steps[].content` for `tool-call` parts. The simplification belongs inside `runAgent()` so callers don't think about session logging. ~200 chars/session vs 10K+ raw.

## Dreaming — Anthropic's "never modify the input" pattern

> Adapted in [`memory.md`](memory.md) §Dreaming: git (one commit per pass, `git revert` to undo) replaces the `.new` + atomic swap.

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

## Channels, commands and actions (planned, 2026-10-16)

chota is reached from more than one chat app: Telegram now, WhatsApp next ([`whatsapp.md`](whatsapp.md)), a business's staff bot later. Everything that isn't transport lives once, in shared code; each channel is a thin adapter.

**Channel adapter** (`telegram/`, `whatsapp/`): receives a message, checks the allowlist, resolves the sender to a person, queues the turn per chat, calls the agent, renders the reply in its own format. Owns only transport, identity and formatting.

**Slash commands — one registry, every channel.** `src/lib/server/commands/`: one file per command, `{ name, description, args, run(ctx) → reply }`, where a reply is text, an image, a document, or a list of choices. Adapters map it: Telegram registers each with `setMyCommands` and renders choices as inline buttons; WhatsApp parses a leading `/` and renders choices as a numbered list ("reply 1–3"). `/print` and `/start` move here out of `telegram/bot.ts`. A new command is one file and every channel has it.

**Print as an agent tool, not only a command.** The common case is a kid sending a photo and "print this", or "give me a math puzzle" — the agent should work out what to print. `print` tool:

- input: what (a brief, text, an image from the message, a puzzle) and where — `thermal` (the MUNBYN, default) or `laser` (the Brother HL-L2350DW on Wi-Fi, often off: the tool checks it's reachable and says so if not). The laser goes through CUPS driverless IPP/AirPrint on the box.
- **Approval** with the SDK's `toolApproval` on `ToolLoopAgent` (in `ai` 7.0.140; `needsApproval` is the `WorkflowAgent` name). A policy function per call: thermal from an allowlisted person → `'approved'`; laser, or more than a page or two → `'user-approval'`. The adapter shows "Print 3 pages on the Brother? yes / no", appends the `tool-approval-response`, and calls the agent again. Tell the model not to retry a denied print.
- `/print` stays as the fast path that skips the model.

**A message that arrives mid-turn.** The per-chat queue holds it. If the agent is between steps, `prepareStep` appends it to `messages` so the next step sees it (it can't enter mid-token); if the turn already finished, it runs as the next turn. No aborting a turn halfway.

**Short replies, per channel.** `STYLE` already says one short sentence. The adapter passes `channel` into the per-call layer of the prompt, which adds that channel's formatting: Telegram rich text; WhatsApp `*bold*`/`_italic_`, no tables or headings, bare URLs; print output sized for the 80mm thermal roll (576px). No streaming on WhatsApp — typing indicator, then the reply.

## Models (2026-10-16)

A personal bot with light use: **speed matters more than raw capability**, and per-message cost is cents either way. Common tasks get guided by skills and good tools rather than a smarter model.

- **Agent (switched 2026-10-16): `deepseek/deepseek-v4.1-flash-fast`** with `web_search` (Exa, `highlights` excerpts — usually enough on their own) and `web_fetch` (Browserbase Fetch, Markdown) in `agent/tools/web.ts`. Live check: a headline search in 4.1s ($0.018), reading the NSW 2026 calendar page in 2.4s ($0.010) with the right answer. Was `google/gemini-3.8-flash` + `google_search`, whose grounding bills $14 per 1,000 searches after 5,000 free a month ([Google](https://ai.google.dev/gemini-api/docs/google-search#pricing)).
- **Why DeepSeek Flash Fast** ($0.60 / $2.40, served by Baseten in the US). On a raincoat question (weather tool, 2 steps) and a kids' maths puzzle, 2 runs each:

  | Model                        | Raincoat (tool) | Puzzle       | $ per reply   |
  | ---------------------------- | --------------- | ------------ | ------------- |
  | gemini-3.8-flash             | 6.4–7.2s        | 4.8–9.2s     | 0.0008–0.0019 |
  | glm-5.3-flashx (Z.ai, CN)    | 8.2–9.0s        | 4.4–4.9s     | 0.0002–0.0003 |
  | **deepseek-v4.1-flash-fast** | **1.3s**        | **0.7–1.0s** | 0.0002–0.0007 |
  | deepseek-v4.1-flash          | 2.5s            | 1.8–1.9s     | ~0.0000       |

  Answers were equally good (its puzzles checked out). Five to seven times faster is the difference between a chat and a wait. It has no built-in search, so it pairs with the Gateway tools below.

- **Web search for non-Gemini models** — the Gateway's own tools, from `ai`: `gateway.tools.perplexitySearch()` ($5 per 1,000) or `gateway.tools.exaSearch()` ($7 per 1,000, up to 10 results). Weather + headline prompt: GLM + Perplexity 9.6s / $0.023 all-in, GLM + Exa 12.1s / $0.030, Gemini + `google_search` 8.1s / $0.031 + grounding; Gemini + Exa was worst (3 searches, 16.5s, and a thought-signature warning) — keep Gemini on its own search if it stays.
- **Exa content:** `exaSearch({ contents: { highlights: true } })` returns agent-friendly excerpts per result; `text` returns the page body (`maxCharacters`, `includeSections: ['body']`), plus `maxAgeHours`, `livecrawlTimeout`, subpages, links. Exa's get-contents-by-URL endpoint and its deep/summary modes aren't exposed.
- **Reading a known URL:** `gateway.tools.browserbaseFetch()` (in `@ai-sdk/gateway` 4.0.115, via `ai` 7.0.142) — $1 per 1,000 raw, more for proxies and markdown/JSON extraction. Gemini also has `google.tools.urlContext()`. Test (NSW Term 4 2026 end date, which our ICS feed says is Thu 17 Dec, holidays from Fri 18): GLM + Browserbase Fetch followed the link to the 2026 page and got **17 Dec right** (17s, ~21K tokens); Gemini + URL context answered "Friday 18 December, classes end Wednesday 16" — **wrong**, invented detail. No need for our own fetch tool: Browserbase Fetch is cheap and works with any model; write one only if a site needs cookies or a login (Sentral already has its own).
- **GLM flashx** stays a candidate for cheap background work (summaries, the dreaming pass); it's served from China (Z.ai), so not for family chat content.
- **Speech:** `google/gemini-3.8-flash-tts` (and `-lite-tts`) for audio replies — a news roundup or a short story as a voice note. See [`whatsapp.md`](whatsapp.md) §Voice. `google/gemini-3.8-live` (realtime) is the candidate for live voice later.

**Own fetch later:** `web_fetch` is our name over Browserbase, so it can move to our own lib or Exa's contents API (when the Gateway exposes it) without touching the prompt. Browserbase Fetch doesn't run JavaScript or log in.

## Decisions — cheap judgments with `experimental_decide` (planned)

Many small calls in chota are judgments, not conversations: a typed answer to a fixed question. `experimental_decide` (in `ai` 7.0.140, experimental) asks named `boolean` / `choice` / `score` questions about a state and returns typed answers. Jev is a native decision model: about 100 ms and $0.042 per million input tokens on the Gateway. Use `gateway.decisionModel('typesafe-ai/jev')`; pin a version (`typesafe-ai/jev-1.14.0`) once thresholds are tuned against it, because `jev` floats (1.14 becomes latest around 2026-10-21). Through the Gateway, state is text and JSON only. Jev 1.14's images and `box` type need the direct TypeSafe provider and its opt-in headers — so "is this photo printable?" waits, or goes to a Gemini decision adapter.

House rules (KO's `decision-models` skill): one module owns every decide call (`agent/decide.ts`); questions, criteria and thresholds are data in a file; a judgment suggests and code thresholds it ("maybe" is a probability band, not an option); store every probability with the model id; every caller treats a throw as "no suggestion"; and none on a latency-critical path.

Candidates, roughly in order of value:

- **Approval policy:** inside the `print` tool's approval function — "is this appropriate to print for a kid without a parent?" as a boolean.
- **Group gate:** in the family group, "is this addressed to chota?" for messages that say its name without an @mention. On the reply path, so it must fail open to the plain mention rule.
- **List intents in untagged group messages:** one `choice` per message — `shopping_item` | `watch_item` | `bought_or_done` (tick off) | `family_todo` | `none` — over the message text, plus a link's page title when there is one. Above a threshold, run the agent with the message and a hint ("Jev: 0.91 this is a shopping item"); the agent still makes the call and does the add or tick-off. Below it, stay silent. Reply with an emoji reaction rather than a message so the group isn't noisy (yaad's `TOOL_EMOJIS`). Labels come from the family's undo/correct replies. Off the reply path for tagged messages, so latency is fine.
- **Morning brief:** weather/surf warning worth a line? print or skip on a holiday?
- **Memory inbox:** "is this a durable family fact?" before appending to `bot/inbox.md` ([`memory.md`](memory.md)).
- **Repeats:** "is this the same ask as one from the last few days?" — feeds the crystallize-into-jobs idea.

Prior art: `~/code/everx/web/src/lib/server/chat/jev.ts` (`jevEvaluate` — fails when answers are missing, logs tokens and time) and `~/code/jaldi/docs/judgments.md`. Label a handful of real examples per question before trusting one.

## Photos (planned) — lessons from everx (2026-10-16)

From the everx session (`~/code/everx/docs/photos.md`, `web/src/lib/server/chat/vision.ts`), which reads equipment photos in production:

- **One model for chat and photos (KO, 2026-10-16):** the agent model handles images too — it's already in the conversation with the tools and context. `deepseek/deepseek-v4.1-flash-fast` is tagged `vision` on the Gateway, but test it on real photos first: everx used a separate `google/gemini-3.8-flash` (84/84 plate strings exact, ~$0.0024 a read), and a cheaper model once got routed to a provider that never saw the image and **invented a read** — check the image actually reached the model. Fall back to a vision-only call if DeepSeek reads badly.
- **Captioning and transcription are different calls.** A quick caption ("what is this") is not a read. For text-heavy photos — a school notice — transcribe every printed line first (`- **Label:** value`), then extract (events, dates, "bring X") in a second, text-only step that keeps the source line next to each fact.
- **Plain-text fixed layout beats JSON** for vision output (fewer retries and schema failures); parse tolerantly.
- **Anti-hallucination rules:** copy values exactly; "(partly legible)" plus what's readable, never guess the rest; say what's there, not "appears to be".
- **Facts from photos are suggestions:** shown with the photo they came from and confirmed before anything is written (calendar, lists).
- **Send what the chat app gives you** — Telegram/WhatsApp already send a compressed JPEG; keep the original when there's small print.

chota's cases: "print this" needs no model (print the image); a school notice → transcribe, extract, confirm, then calendar drafts and a line on that kid's sheet; a shopping photo → a typed decision ("a product to add? which?") and a confirm.

**Prompt lessons from everx's flash-model agent**, now in `STYLE`: counts must match the rows shown; copy URLs from tool results rather than retyping; never claim "saved/added" unless this turn's result shows it; no narrating tool choice. Two still to do: everx returns `activeTools: []` from `prepareStep` on the last allowed step, so a turn never ends on a tool call with no text; and tool results carry true totals plus a short precomputed summary when rows are capped, so the model quotes figures instead of summing. **Approvals on chat:** an approval request with no buttons just ends the turn silently — render buttons (Telegram) or a numbered reply (WhatsApp), or keep write tools off that surface. everx's rule: approval when a write reaches another person or can't be undone.

## Consumers

- **Telegram** (shipped) — the main interactive surface. `message:text` → `runAgentStream({ messages })` → streamed Rich-Message reply with a thinking block + the message-history context above; `/print [who]` sends a brief PNG. Whitelisted + hardened. See [`docs/telegram.md`](telegram.md).
- **`/admin/agent`** — chat UI for debugging the agent (built).
- **Jobs** (planned) — the morning-brief closing line is the first agent-driven job; a job calls `runAgent()` with job-specific tags. See [`docs/jobs.md`](jobs.md).

## Gotchas (v7)

- **`inputSchema` not `parameters`** (silent mistype).
- **`CoreMessage` → `ModelMessage`**, **`convertToCoreMessages` → `convertToModelMessages`** (matter only when bridging UI ↔ server).
- **Plain model-slug strings auto-route through AI Gateway** when `AI_GATEWAY_API_KEY` is set — no `@ai-sdk/gateway` import needed. Gateway tools (`gateway.tools.*`) also come from `ai`; no provider SDK is installed.
- **Don't hardcode model IDs from memory** — fetch current ones from the gateway.
- **Tool approvals are `toolApproval` on the agent**, not `needsApproval` on the tool — that's the `WorkflowAgent` API. Check the installed docs (`node_modules/ai/docs`) over the website.
- **Provider-native tools need their fixed key** (e.g. Gemini's `google_search`); the Gateway's own tools don't, so ours are named `web_search` / `web_fetch`.

## Future / worklog

- **On `ai` v7 now.** When a second agent role appears, adopt the native [subagents](https://ai-sdk.dev/v7/docs/agents/subagents) primitive instead of the hand-rolled agent-as-tool above (book-agent pattern).
- **Wire the model/usage metadata capture** (§What to capture) — enrich the `agent.run` wide event with the actual `response.modelId` + `finishReason`, and store a compact `{ model, in, out, finishReason, steps }` blob on `chat_message` assistant rows.
- **PostHog AI observability** ([posthog.com/ai-observability](https://posthog.com/ai-observability)) — we already ship events to PostHog via the OTel sink; PostHog's LLM-analytics adds per-generation cost/latency/trace dashboards on top. Low effort later + a useful pattern for other projects. (Captured in `~/code/ops/inbox.md`.)
- **Sandbox + bash-tool / skill `scripts/`** — [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox), [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool). For jobs where the agent writes + runs code, and for executing skill `scripts/`. Revisit in the **v7 era** — interesting sandbox products are emerging. Deferred; typed tool wrappers cover everything today.
- **Code mode** (`@ai-sdk/code-mode`, experimental) — the model writes sandboxed JS that calls several tools at once. Not worth it at six tools and one-sentence replies; revisit when the agent drives jobs.
- **Page watcher** — a "watch this page" tool + job that messages the family when a page changes (school notices, fixtures, a price). Idea from [changedetection.io](https://github.com/dgtlmoon/changedetection.io); build it small rather than running that service.
- **Memory store + dreaming consolidation** (§Memory, §Dreaming) — the high-value durable layer; deferred behind the single-writer-lock + injection-boundary work.

## References

- [AI SDK docs](https://ai-sdk.dev/docs) · [building agents](https://ai-sdk.dev/docs/agents/building-agents) · [v7 subagents (beta)](https://ai-sdk.dev/v7/docs/agents/subagents) · [memory](https://ai-sdk.dev/docs/agents/memory)
- [eve](https://vercel.com/eve) ([blog](https://vercel.com/blog/introducing-eve), source at `~/code/refs/eve`) — file-based agent + skills patterns we borrowed (skills format, `load_skill`, progressive disclosure). We skip its durable-execution + sandbox machinery.
- [agentskills.io](https://agentskills.io) — the open Agent Skills format (SKILL.md + `references/`/`assets/`/`scripts/`, progressive disclosure) behind our deferred skills design.
- [Anthropic managed-agents: Dreams](https://platform.claude.com/docs/en/managed-agents/dreams) — the never-modify-the-input pattern for the dreaming job.
