# Logging — design notes

Status: **proposal**, not built. Today: a tiny `console.log` wrapper (`src/lib/server/log.ts` → `08:42 [bus] 5 departures`) to stdout, and job runs in a 20-row in-memory ring buffer lost on restart.

## The decisions

- **Logging = [LogTape](https://logtape.org/)** — a console sink (Railway/journald-friendly) + a rotating file sink at **`data/logs/chota.log`**. No DB table for logs (a `logs`/`events` table would just double up; a flat rotating file is plenty for a 5-user kiosk). The *only* DB table in the picture is `job_runs`, and that's *state* for the retry/catch-up watchdog → see `docs/jobs.md`.
- **LLM cost goes in the log line as a field** (`cost_usd` on the `agent.turn` event) — no `cost_log` table; for real spend numbers we'd check OpenRouter / the AI Gateway dashboard.
- **Use LogTape's built-ins as much as possible** — `getConsoleSink`, `getRotatingFileSink` (from `@logtape/file`), `nonBlocking` mode, `withContext`. Don't hand-roll rotation or buffering.
- **Rotation is size-based** (LogTape's [rotating file sink](https://logtape.org/sinks/file#rotating-file-sink) rotates on `maxSize`, not on time). Set generous limits — disk is cheap — e.g. `maxSize: 8 MiB`, `maxFiles: 30` → up to ~240 MiB retained, which at Chota's volume is *months*, well past the "~30 days" we want.

## Severity levels

LogTape has **six fixed levels** (no custom ones): `trace` < `debug` < `info` < `warning` < `error` < `fatal`. We'll use:

| Level | When | Example |
|---|---|---|
| `info` | normal operation — the bulk | server started; a job ran; a brief printed; a tool refreshed |
| `warning` | unexpected but didn't break anything | screenshot path fell back to the canvas renderer; bus times are scheduled-only (no realtime); a Sentral cookie's getting stale |
| `error` | an operation failed | a brief didn't print (printer off); a tool call failed; a job gave up after N retries |
| `fatal` | the app can't run | DB won't open; required config missing at boot |

`debug` / `trace` stay available but are unused by default (no high-frequency chatter). So ~4 active levels — not the strict info/error two, but close, and the extra two earn their keep.

## How: wide events (canonical log lines)

One context-rich **structured** event per *unit of work*, built up as the work happens and emitted at the end (in a `finally`). For Chota the units of work are small and few:

- **server start** (`server.start`) — once, at boot
- a **job run** (the 06:45 morning print; each tool refresh) — `defineJob`'s wrapper assembles + emits it
- a **meaningful action** from a request (a print `POST`, a manual refresh, sign-in) — the endpoint emits it
- later, an **agent turn** (one user question → one answer)

We do **not** log every HTTP request — most are dashboard page loads with nothing to say. Within a job we don't log sub-steps either: "the brief data got assembled" is a *field* on the one `print.brief` event (`sectionsAssembled: 7`), not its own line. (See [Stripe — Canonical Log Lines](https://stripe.com/blog/canonical-log-lines), [Wide Events 101](https://boristane.com/blog/observability-wide-events-101/).)

### Rules

- **Structured, never bare strings.** LogTape's form: a message *template with named placeholders* plus a props object —
  `log.info("printed {who} brief: {bytes}b via {renderer}", { who, bytes, renderer, durationMs, outcome })`. `jq` on `data/logs/chota.log` then answers questions we didn't anticipate. (`log.debug\`...\`` template-literal form exists for throwaway dev logging — not for the events above.)
- **Terse, factual messages.** `"print failed for {who}: {error}"`, not "Uh oh, the printer seems to be off!". The detail lives in the structured fields (`{ who, error, renderer, errno? }`); the message is a one-liner a human can scan. Computer speaking to the point.
- **Base context on every event.** Set once at boot (via `withContext` or baked into the `event()` helper): `version` (package.json / git SHA), `env` (`dev`/`prod`). One line tells you which build.
- **Business context, not just technical.** `who`/`recipient` (e.g. `kid1`/`kid2`/`family` — actual names come from `chota.config.ts`), `list` (TickTick list name), `kind` (`morning`/`test`), `route`. Aim: "kid2's brief failed because the printer was off", not "print job failed".
- **Correlation id where it's meaningful.** A job run gets a `runId` (= the `job_runs.id`, ties the log line to the DB row); an agent turn gets a `sessionId`. A page load gets nothing.
- **One logger, configured once at startup, imported everywhere** (`src/lib/server/log.ts`). Hierarchical categories map onto today's `[scope]` convention: `getLogger(["chota"])`, `["chota","jobs"]`, `["chota","tool","ticktick"]`, `["chota","print"]`. The `defineJob` wrapper is the "middleware" for jobs (timing/status/emission); endpoints just add their fields.

## What we emit (and what we don't)

| Event | Level | Key fields | Notes |
|---|---|---|---|
| `server.start` | `info` | `version`, `env`, `port`, `jobsRegistered` | Once at boot — handy to see restarts. |
| `job.run` | `info` / `error` | `job`, `runId`, `durationMs`, `outcome`, `summary`, `error?` | One per job fire. Also writes a `job_runs` row (the `runId`). |
| `print.brief` | `info` / `error` | `who`, `kind`, `sectionsAssembled`, `bytes`, `renderer: 'screenshot' \| 'canvas'`, `durationMs`, `outcome`, `error?` | When a brief is printed (from the job or a `POST /api/print/...`). |
| `tool.<name>` (`tool.ticktick`, `tool.bus`, `tool.sentral`, `tool.weather`, `tool.calendar`, …) | `info` ok / `error` fail | `op` (`refresh`/`fetch`), `count?`, `stop?`/`list?`, `durationMs`, `outcome`, `error?` | Refreshes (5–30 min) emit `info` — not noisy. `jq 'select(.category[-1]=="ticktick" and .outcome=="failed")'` tells you how flaky TickTick is. |
| `auth.signin` / `auth.signout` | `info` | `userId`, `email` | A breadcrumb; better-auth owns its own tables. |
| `agent.turn` (when the agent lands) | `info` / `error` | `sessionId`, `model`, `tokensIn`, `tokensOut`, `cost_usd`, `tools: [...]`, `outcome` | Cost is a field here — no `cost_log` table. |
| `qa` (much later, if user Q&A is exposed) | `info` | `question`, `answer`, `cost_usd?`, `sessionId` | Just question→answer; skip the agent's internal tool-call chatter. |
| Every HTTP request / SvelteKit hook / render internals / cache hits | — | — | **No.** |

## Sketch

Packages: `@logtape/logtape` (core — `configure`, `getLogger`, `getConsoleSink`, `withContext`) + `@logtape/file` (file sinks). Optionally `@logtape/pretty` for a nicer dev console.

```ts
// src/lib/server/log.ts (sketch — replaces the console.log wrapper)
import { configure, getLogger, getConsoleSink, withContext } from '@logtape/logtape';
import { getRotatingFileSink } from '@logtape/file';
import { dev } from '$app/environment';

await configure({
  sinks: {
    console: getConsoleSink({ nonBlocking: true }),
    file: getRotatingFileSink('data/logs/chota.log', {
      maxSize: 8 * 1024 * 1024, maxFiles: 30,        // size-based; ~months at our volume
      bufferSize: 8192, flushInterval: 5000, nonBlocking: true
    })
  },
  loggers: [
    { category: ['chota'], lowestLevel: 'info', sinks: ['console', 'file'] },
    { category: [], lowestLevel: 'warning', sinks: ['console'] }   // catch-all for anything outside ["chota"]
  ]
});

const root = getLogger(['chota']);
export const logger = (scope: string) => root.getChild(scope);   // logger('tool/ticktick') -> ["chota","tool","ticktick"]

/** A wide-event emitter for one unit of work — accumulate fields, .done()/.fail() at the end. */
export function event(category: string, message: string, base: Record<string, unknown> = {}) {
  const log = root.getChild(category);
  const start = Date.now();
  const fields: Record<string, unknown> = { ...base };
  return {
    set(k: string, v: unknown) { fields[k] = v; return this; },
    done(extra?: Record<string, unknown>) { log.info(message, { ...fields, ...extra, durationMs: Date.now() - start, outcome: 'ok' }); },
    fail(err: unknown, extra?: Record<string, unknown>) {
      log.error(`${message} failed`, { ...fields, ...extra, durationMs: Date.now() - start, outcome: 'failed',
        error: err instanceof Error ? err.message : String(err) });
    }
  };
}
// Base context (version, env) — set once at boot via withContext(...) before bootJobs(),
// or fold into `event()`'s base. Either way every record carries it.
```

`defineJob`'s wrapper: `const ev = event('jobs', `ran {job}`, { job: name, runId }); try { ev.set('summary', await fn()).done(); } catch (e) { ev.fail(e); }` — plus the `job_runs` row.

Legacy `log('scope', ...string)` callsites keep working via a thin compat shim (`logger(scope).info(args.join(' '))`); migrate the interesting ones to `event(...)` over time. New code uses `event(...)` / `logger(...)`.

## Open decisions

1. **`__APP_VERSION__`** — inject via Vite `define` from package.json `version` (+ git SHA in CI). Trivial; do it with the LogTape swap.
2. **`@logtape/pretty` for dev?** — nice-to-have; the plain console sink is fine. Skip unless the dev output annoys us.
3. **`withContext` for job runs** — could set `{ runId }` in context so any incidental log line inside a job inherits it. Marginal given we emit one wide event per job; decide when implementing.
4. **`job_runs` table** — lands with the retry/catch-up task (`docs/jobs.md`), not separately; referenced here only as the source of `runId`.
5. **Adopt now?** — leaning *yes*: a one-off `log.ts` rewrite, unlocks structured/greppable events + real levels + a rotating file, and the surface stays as small as today (a handful of `event(...)` calls).
