# agent/

The chota agent — one `ToolLoopAgent` instance, one growing folder of typed
tool definitions. Surfaces that need an LLM (eventually a Telegram handler,
maybe a `/admin` scratch endpoint, possibly some job loops) all import the
agent from `./index.ts`. Nothing else in the repo imports `ai` or `zod`
directly.

`tools/` here is **not** `$lib/server/tools/`. The latter is pure I/O — each
file fetches weather, calendar, bus times etc. and returns the raw shape. The
files in `agent/tools/` are typed Vercel AI SDK tool definitions that wrap
those libs with the `description` + `inputSchema` the LLM needs to pick + call
them, plus any shaping ("just the next 6 hours", "only today's events") that
keeps the tool's response terse.

## Before writing anything here, load the skill

The `ai-sdk` skill at `.agents/skills/ai-sdk/` is the canonical source for v6
patterns. Read these first, in this order:

1. `.agents/skills/ai-sdk/SKILL.md` — top-level prerequisites + the "do not
   trust internal knowledge" rule. **Always fetch current model IDs from the
   AI Gateway** — never use IDs from memory.
2. `.agents/skills/ai-sdk/references/type-safe-agents.md` — the `ToolLoopAgent`
   pattern and `InferAgentUIMessage<typeof agent>` for the eventual typed
   Telegram handler.
3. `.agents/skills/ai-sdk/references/common-errors.md` — v5→v6 renames that
   bite if you copy from older docs (`maxSteps` → `stopWhen: isStepCount(n)`,
   `parameters` → `inputSchema`, `maxTokens` → `maxOutputTokens`).
4. `.agents/skills/ai-sdk/references/ai-gateway.md` — gateway-specific
   patterns including caching, tags, and model routing.

## Shape

```
agent/
  index.ts             # the single ToolLoopAgent instance (+ thin event() wrapper around .generate())
  tools/               # one file per tool, basename matching the data lib it wraps
    weather.ts
    calendar.ts
    ...
  memory.ts            # later — SQLite-backed memory store (Stevens-shape; flat table to start)
  prompts.ts           # later — shared system-prompt fragments per recipient
```

Memory and prompts join when there's a real second use of them. Until then,
inline whatever's needed.

## Tool conventions

- **One tool per file.** Basename matches the data lib it wraps
  (`agent/tools/weather.ts` ↔ `tools/weather.ts`).
- **Description is for the LLM.** Be terse + specific — it's how the model
  decides whether to call you vs another tool.
- **`inputSchema: z.object({})`** for argument-free tools; otherwise zod-
  validate every field and use `.describe(...)` so the field meaning rides
  with the schema.
- **`execute` returns a small, scalar-shaped object** — no full payloads,
  no blobs. Slice + shape before returning. The LLM sees this back as a
  tool result; smaller is cheaper.
- **Tool errors don't throw in v6** — they land as `tool-error` parts in the
  agent's step content. Wide-event log captures the step count; inspect
  `steps` to debug a specific failure.
- **Don't reach for the DB or external APIs directly from a tool.** Call the
  matching data lib in `$lib/server/tools/` — that's where the caching,
  error handling, and stale-ok behaviour already live.

## Wide-event logging

Every agent invocation emits one `agent.run` wide event via the `event()`
helper in `$lib/server/log.ts` — `model`, `tokens_in`, `tokens_out`, `steps`,
`outcome`, `duration_ms`. That's what reaches PostHog via the OTel sink and
answers "is the agent useful or burning money?" Wrap `agent.generate(...)`
in a thin helper here rather than spreading `event(...)` calls across
callers.
