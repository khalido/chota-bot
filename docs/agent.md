# Agent

[Vercel AI SDK](https://ai-sdk.dev/docs/introduction) is our **sole** agent runtime. Pi-coding-agent was originally in the plan but dropped — our agent calls typed tool wrappers and writes notes, it never writes/runs code. One SDK, one mental model.

## Stack decision

| Concern | Choice | Why |
|---|---|---|
| Runtime | `ai` package | Already needed for kiosk UI streaming. Active development, current API. |
| Provider routing | AI Gateway via `gateway('deepseek/deepseek-v4-flash')` | One key, multi-provider. Cost attribution via tags |
| Default model | `deepseek/deepseek-v4-flash` | Cheap, fast, good enough for tool-calling jobs |
| Heavy job model | `deepseek/deepseek-v4-pro` | Dreaming/consolidation only |
| Memory | JSONL via custom tool | See §"Memory tool" below |
| Sandbox | None | Tools are typed wrappers, not arbitrary code execution |

## The one primitive: `generateText`

```ts
import { generateText, gateway, stepCountIs, tool } from 'ai';

const { text, steps, usage } = await generateText({
  model: gateway('deepseek/deepseek-v4-flash'),
  system: '...',
  prompt: '...',
  tools: { ticktick, tmdb, memory },
  stopWhen: stepCountIs(10),
  abortSignal: AbortSignal.timeout(90_000),
  providerOptions: {
    gateway: { only: ['anthropic'], tags: ['chota', 'job-news'] }
  }
});
```

The SDK auto-loops tool calls back into the model. **Don't** write `while (hasToolCalls)` — `stopWhen` handles termination.

## Tools — current shape (v5+)

```ts
import { tool } from 'ai';
import { z } from 'zod';

const memory = tool({
  description: 'Read, write, search, or delete entries in long-term memory.',
  inputSchema: z.object({           // NOT `parameters` — that's the v3/v4 name
    op: z.enum(['search', 'add', 'delete', 'update']),
    query: z.string().optional(),
    tags: z.array(z.string()).optional(),
    content: z.string().optional(),
    id: z.string().optional()
  }),
  outputSchema: z.object({           // optional but useful for tool-chained output
    records: z.array(z.object({ id: z.string(), content: z.string() })).optional(),
    id: z.string().optional()
  }),
  execute: async ({ op, query, tags, content, id }, { abortSignal }) => {
    // propagate abortSignal to any fetch inside
  }
});
```

Notes:
- **`inputSchema` not `parameters`**. v5 rename. Old `parameters:` silently mistypes
- `outputSchema` optional. Use when wrong output shape would corrupt downstream tool calls
- `execute` receives `{ abortSignal }` as second arg — propagate to fetches inside

## Tool errors don't throw (v5 change)

In v4, a thrown error in `execute` would surface as `ToolExecutionError`. **In v5, errors land as `tool-error` content parts inside `result.steps`.** You must inspect them explicitly:

```ts
const toolErrors = result.steps.flatMap((step) =>
  step.content
    .filter((part) => part.type === 'tool-error')
    .map((part) => ({ toolName: part.toolName, error: part.error }))
);
if (toolErrors.length) log('agent', 'tool errors:', toolErrors);
```

## The minimal `runAgent()` wrapper

Ship this wrapper when the first agent job lands. Bakes in all the safety caps from day one (per opus advice + croner research).

```ts
// src/lib/server/agent/index.ts
import { generateText, gateway, stepCountIs } from 'ai';
import type { Tool } from 'ai';
import { log, logErr } from '$lib/server/log';

export interface RunAgentOptions {
  prompt: string;
  system?: string;
  tools: Record<string, Tool>;
  /** Defaults to haiku. Use sonnet for the dreaming job. */
  model?: string;
  /** Defaults to 10. Cheap jobs can go lower. */
  maxSteps?: number;
  /** Caller-provided cancellation. Composed with internal 90s timeout. */
  signal?: AbortSignal;
  /** Gateway tags for cost attribution: shows in usage dashboard. */
  tags?: string[];
}

export interface RunAgentResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  stepCount: number;
  toolErrors: { toolName: string; error: unknown }[];
}

export async function runAgent({
  prompt,
  system,
  tools,
  model = 'deepseek/deepseek-v4-flash',
  maxSteps = 10,
  signal,
  tags = []
}: RunAgentOptions): Promise<RunAgentResult> {
  const timeout = AbortSignal.timeout(90_000);
  const abortSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const result = await generateText({
    model: gateway(model),
    system,
    prompt,
    tools,
    stopWhen: stepCountIs(maxSteps),
    abortSignal,
    providerOptions: {
      gateway: { only: ['anthropic'], tags: ['chota', ...tags] }
    }
  });

  const toolErrors = result.steps.flatMap((step) =>
    step.content
      .filter((p): p is typeof p & { type: 'tool-error' } => p.type === 'tool-error')
      .map((p) => ({ toolName: p.toolName, error: p.error }))
  );
  if (toolErrors.length) logErr('agent', 'tool errors:', toolErrors);

  log('agent', `${model} steps=${result.steps.length} in=${result.usage.inputTokens} out=${result.usage.outputTokens} tags=${tags.join(',')}`);

  return {
    text: result.text,
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
    stepCount: result.steps.length,
    toolErrors
  };
}
```

Call from a job:

```ts
const { text, toolErrors } = await runAgent({
  prompt: 'Search Exa for kid-friendly news this week. Pick 3, summarise.',
  tools: { exa, ticktick, memory },
  maxSteps: 8,
  tags: ['job-weekly-news']
});
```

## Memory tool (when we land it)

Per the [Vercel cookbook](https://ai-sdk.dev/cookbook/guides/custom-memory-tool). One tool with a `op` discriminator (`search` / `add` / `update` / `delete`). Single JSONL file `data/memory/family.jsonl`. Records:

```jsonl
{"id":"mem_abc","created":"2026-05-11T03:00:00Z","tags":["kid2","sport"],"content":"..."}
```

The `family.jsonl` long-term file + dated session logs + nightly dreaming consolidation are the two-layer pattern. See §Sessions and the dreaming section further down.

## Sessions: simplified, not raw

`generateText` returns a `steps` array with full message history — user prompt, tool calls + JSON results, intermediate assistant text. Storing those raw is **expensive** to keep and **noisy** to feed back to the dreaming agent.

Instead, after every `runAgent()` call, we extract a 5-field simplified record and append to today's session log:

```jsonl
// data/memory/sessions/2026-05-11.jsonl
{"id":"ses_abc","at":"2026-05-11T10:30:00Z","job":"weekly-news","input":"Search news for...","tools":{"exa.search":3,"exa.fetch":2,"ticktick.add_task":1},"output":"Added 3 articles to Notes","tokens":{"in":4800,"out":720},"steps":7,"errors":[]}
```

Where:
- `input` — the prompt we passed to the agent (or the user's request if voice/chat)
- `tools` — count of each tool name called: `{ "exa.search": 3, "exa.fetch": 2 }`. Just counts, not arguments — those become noise at consolidation time
- `output` — `result.text` from `generateText`
- `tokens`, `steps`, `errors` — metadata from the result

Dreaming agent reads these (plus `family.jsonl`) and produces an updated memory. Way less context than feeding raw transcripts. ~200 chars/session vs 10K+ raw.

The simplification happens in `runAgent()` itself — caller doesn't need to know about session logging:

```ts
// Inside runAgent (sketch):
const toolCounts: Record<string, number> = {};
for (const step of result.steps) {
  for (const part of step.content) {
    if (part.type === 'tool-call') toolCounts[part.toolName] = (toolCounts[part.toolName] ?? 0) + 1;
  }
}
await appendSessionLog({
  job: tags[0] ?? 'unknown',
  input: prompt,
  output: result.text,
  tools: toolCounts,
  tokens: { in: result.usage.inputTokens, out: result.usage.outputTokens },
  steps: result.steps.length,
  errors: toolErrors.map((e) => e.toolName)
});
```

## Dreaming — adapt Anthropic's pattern

Anthropic's [managed-agents Dreams API](https://platform.claude.com/docs/en/managed-agents/dreams) is the inspiration. We can't use it directly (we're on Vercel AI SDK + local files, not Managed Agents), but the pattern is what we want:

> "A dream reads an existing memory store alongside past session transcripts, then produces a new, reorganized memory store: duplicates merged, stale or contradicted entries replaced with the latest value, and new insights surfaced."
>
> **"The input store is never modified, so you can review the output and discard it if you don't like the result."**

The "never modify input" part is the key safety property — opencode flagged "Sonnet rewrites family.jsonl" as the highest-corruption-risk operation in our design. Anthropic's solution: write a fresh output, swap atomically only after success.

Our implementation:

1. **Daily 03:00 Sydney** — `dreaming.ts` job fires
2. **Read inputs** (don't touch them):
   - `data/memory/family.jsonl` (current memory)
   - Last 1-2 days of `data/memory/sessions/YYYY-MM-DD.jsonl` (simplified sessions)
3. **Write output** to `data/memory/family.jsonl.new` via the agent. Sonnet, `maxSteps: 15`, has `memory.add/update/delete` tools but pointed at the `.new` file
4. **Atomic swap** after success: `mv family.jsonl.new family.jsonl` (POSIX rename is atomic). Old file gone.
5. **On failure**: leave `.new` in place for inspection, alert in logs. Original untouched
6. **Archive**: dated session logs older than 7 days get gzipped to `archive/` (not deleted — auditable)

The agent's prompt:
```
You're consolidating chota's family memory. Read the current memory and the
last 24h of session summaries. Produce a refined memory file:

1. DEDUPE: collapse multiple entries about the same fact
2. PRUNE: remove stale entries (one-time events that already passed)
3. SHARPEN: tighten verbose entries into single sentences
4. ADD: noteworthy facts from sessions not yet in memory
5. KEEP if unsure: bias toward retention

Use memory.add + memory.delete (delete-then-add for edits). Output a one-paragraph
summary of changes for the morning print.
```

That summary becomes a print section: "**Memory updated**: 3 new facts about Kid2, removed 2 stale events".

### Why not "model emits ops"?

Opencode floated emitting ops (`{add: ..., delete: id}`) instead of letting the agent rewrite. But with the atomic-swap pattern, the rewrite IS safe — the worst case is a bad output we discard. The ops approach adds protocol complexity and loses the agent's ability to reason holistically about the file. Stay with rewrite + safe swap.

## Hardening that's mandatory from day one

Per opus's review and croner research:

1. **`stopWhen: stepCountIs(n)`** on every `generateText` — prevents infinite loops
2. **`AbortSignal.timeout(90_000)`** wall-clock cap on `runAgent`
3. **Per-tool fetch timeouts** already in our tool wrappers (`AbortSignal.timeout(10_000)`)
4. **Tool errors are inspected** — not assumed-thrown (v5 behaviour change)
5. **Cost logged per call** — `result.usage` is always present, log it
6. **`AbortSignal.any`** to compose caller signal + internal timeout (Node 20+)

Without these we get:
- Loops that burn tokens overnight (no `stopWhen`)
- Frozen ticks that wedge subsequent jobs (no timeout)
- Silent data corruption from tool errors (not inspecting `steps`)

## Gotchas to remember

- **`inputSchema` not `parameters`** (v5 rename, silent failure if wrong)
- **`CoreMessage` → `ModelMessage`** (renamed, only matters if we bridge UI ↔ server)
- **`convertToCoreMessages` → `convertToModelMessages`** (same scope)
- **Avoid `ToolLoopAgent` class** — `generateText` + `stopWhen` is simpler and explicit
- **`gateway()` is bundled** — no `@ai-sdk/gateway` install needed since v5.0.36
- **Plain model string works too** — `'deepseek/deepseek-v4-flash'` (or any provider/model id) auto-routes through Gateway when AI_GATEWAY_API_KEY is set

## Future: Vercel Sandbox + bash-tool

If/when we want jobs that benefit from the agent writing + running code (research tasks where iterating in code beats N LLM calls), evaluate:

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) — micro-VM, ephemeral
- [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool) — bash with sandbox primitives

For now, **deferred**. Our 10 typed tool wrappers cover everything we need.
