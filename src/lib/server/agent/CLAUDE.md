# agent/

The chota agent — one `ToolLoopAgent` instance, one growing folder of typed
tool definitions. Surfaces that need an LLM (the live Telegram handler at
`#lib/server/telegram/`, the `/admin/agent` chat, eventually job loops) all
import the agent from `./index.ts`. Nothing else in the repo imports `ai` or
`zod` directly.

`tools/` here is **not** `#lib/server/tools/`. The latter is pure I/O — each
file fetches weather, calendar, bus times etc. and returns the raw shape. The
files in `agent/tools/` are typed Vercel AI SDK tool definitions that wrap
those libs with the `description` + `inputSchema` the LLM needs to pick + call
them, plus any shaping ("just the next 6 hours", "only today's events") that
keeps the tool's response terse.

## Before writing anything here, load the skill

The `ai-sdk` skill at `.agents/skills/ai-sdk/SKILL.md` is the starting point for
current (`ai@7`) patterns: use the docs bundled in `node_modules/ai/docs/`, which
match the installed version, and never write SDK code from memory. **Always fetch
current model IDs from the AI Gateway**, never use IDs from memory.

## Shape

```
agent/
  index.ts             # the single ToolLoopAgent instance (+ thin event() wrapper around .generate())
  prompts.ts           # buildSystemPrompt() — soul + style + today + snapshot, composed per call
  history.ts           # sessions + messages + runs: stores everything; loadHistory decides what the model sees
  turns.ts             # a run's steps → tool parts (call + result together) and numbers
  tools/               # one file per tool, basename matching the data lib it wraps
    weather.ts         # weather + the beach/surf report folded in (sky + sea)
    calendar.ts
    ticktick.ts
    tmdb.ts            # title_info (one movie/show) + watch_ideas (trending, cinemas, like X)
    books.ts           # book — tools/books/ lookup, compact
    bus.ts             # next live departures for the kids' configured trips
    chores.ts          # chore rotation by day / person
    school.ts          # school_day (a kid's timetable) + school_dates (terms, holidays)
    calc.ts            # calc — arithmetic, units, currency (tools/calc/, mathjs + daily rates) and the time in a city
    volleyball.ts      # kids' next games + duty + opponent ladder rank
    content.ts         # save + saved — keep links/photos/voice/documents/notes; the asker comes as call options, never from the model
    spotify.ts         # music_now + music_control + music_play — the Soloist speaker; music_play also searches (tools/spotify-web.ts)
    speech.ts          # announce — say something out loud on the speaker at home ($lib/server/speech.ts)
    schedule.ts        # schedule — reminders sent at a time (#lib/server/userjobs.ts); create, list, update, pause, resume, remove
    web.ts             # web_search (Exa) + web_fetch (Browserbase) — AI Gateway tools, no data lib
```

Registered in `index.ts > tools: { … }`: `weather` (also returns the beach
report), `calendar` (range / date / search), `ticktick` + `ticktick_add` + `ticktick_done`, `bus`, `chores`, `school_day`, `school_dates`, `calc`, `title_info`, `watch_ideas`, `book`, `volleyball`, `save`, `saved`, `music_now`, `music_control`, `music_play`, `announce`, `schedule`, `web_search` and `web_fetch` (AI Gateway's Exa search
and Browserbase Fetch, run gateway-side, so they work with any model).

The system prompt has four layers (see `prompts.ts`):

1. **SOUL** — `soul.md` at the repo root (gitignored, personalised). Falls
   back to `soul.example.md` (committed). Identity + voice only — leave
   tool / behaviour rules to STYLE.
2. **STYLE** — audience (family), brevity ceiling, tool-use cue, "resolve
   relative dates before calling calendar".
3. **TODAY** — `Today is Monday 25 May 2026 (2026-05-25)`. Lets the model
   compute "next Monday" itself.
4. **SNAPSHOT** — today's calendar headlines + family-list state (open +
   ticked-off-today). Best-effort: any one fetch failing drops just that
   line, not the whole prompt.

Rebuilt fresh every call. Prompt-caching can later split (SOUL + STYLE)
from (TODAY + SNAPSHOT) using `SystemModelMessage[]`.

Memory joins when there's a real second use of it.

## Tool conventions

- **Who is asking** goes in as call options (`options: { asker }`, `callOptionsSchema` in `index.ts`); `prepareCall` hands it to the tools that need it as tool context. Anything privacy-related is decided from that, never from model input.

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
- **Tool errors don't throw** — they land as `tool-error` parts in the
  agent's step content. Wide-event log captures the step count; inspect
  `steps` to debug a specific failure.
- **Don't reach for the DB or external APIs directly from a tool.** Call the
  matching data lib in `#lib/server/tools/` — that's where the caching,
  error handling, and stale-ok behaviour already live.

## Wide-event logging

Every agent invocation emits one `agent.run` wide event via the `event()`
helper in `#lib/server/log.ts` — `model`, `tokens_in`, `tokens_out`, `steps`,
`outcome`, `duration_ms`. That's what reaches PostHog via the OTel sink and
answers "is the agent useful or burning money?" Wrap `agent.generate(...)`
in a thin helper here rather than spreading `event(...)` calls across
callers.
