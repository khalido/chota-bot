# Logging — design notes

Status: **built** — `src/lib/server/log.ts` runs on LogTape: a console sink, a rotating JSON-lines file sink at `data/logs/chota.log`, and (when `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` is set) an OTLP cloud sink — PostHog Logs by default, but any OTel-native backend works the same way. This doc now describes what's there — see [`## What got built`](#what-got-built) for the actual setup; the sections above it are the design that led to it.

## The decisions

- **Logging = [LogTape](https://logtape.org/)** — a console sink (Railway/journald-friendly) + a rotating file sink at **`data/logs/chota.log`**. No DB table for logs (a `logs`/`events` table would just double up; a flat rotating file is plenty for a 5-user kiosk). The _only_ DB table in the picture is `job_runs`, and that's _state_ for the retry/catch-up watchdog → see `docs/jobs.md`.
- **LLM cost goes in the log line as a field** (`cost_usd` on the `agent.turn` event) — no `cost_log` table; for real spend numbers we'd check OpenRouter / the AI Gateway dashboard.
- **Use LogTape's built-ins as much as possible** — `getConsoleSink`, `getRotatingFileSink` (from `@logtape/file`), `nonBlocking` mode, `withContext`. Don't hand-roll rotation or buffering.
- **Rotation is size-based** (LogTape's [rotating file sink](https://logtape.org/sinks/file#rotating-file-sink) rotates on `maxSize`, not on time). Set generous limits — disk is cheap — e.g. `maxSize: 8 MiB`, `maxFiles: 30` → up to ~240 MiB retained, which at Chota's volume is _months_, well past the "~30 days" we want.
- **Cloud sink via OpenTelemetry (deferred).** Alongside console + file, a planned third sink: LogTape's [OTel sink](https://logtape.org/sinks/otel) shipping over OTLP. OTel keeps it vendor-neutral — the app emits standard OTLP, the backend is just an endpoint. That vendor-neutrality _is_ the reusable pattern: `LogTape → OTel sink` becomes the standard logging stack for other projects too, only the endpoint changes. Backend candidates, both OTLP-native (no collector to run), both with free tiers far exceeding a kiosk's volume:
  - **[Axiom](https://axiom.co)** — lowest-friction log store; OTLP/HTTP to `api.axiom.co/v1/logs`.
  - **[PostHog Logs](https://posthog.com/docs/logs/basics)** — also pure OTLP ("standard OTel libraries … no proprietary SDK"); bundles logs with error tracking + an MCP server so a coding agent can query the kiosk's logs directly while debugging. Worth a look since the same OTel sink reaches either — the choice is one URL + headers.

  **Best-effort + non-blocking**: if the endpoint is unreachable the kiosk never notices — the file sink is the always-works path. Operational observability only, never in the data path (keeps the local-first ethos intact). The real payoff isn't a dashboard — it's **one alert**: morning-print `outcome: failed` or `renderer: canvas` → a push to the phone, so "the kids didn't get their print" reaches you.

## Severity levels

LogTape has **six fixed levels** (no custom ones): `trace` < `debug` < `info` < `warning` < `error` < `fatal`. We'll use:

| Level     | When                                 | Example                                                                                                                        |
| --------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `info`    | normal operation — the bulk          | server started; a job ran; a brief printed; a tool refreshed                                                                   |
| `warning` | unexpected but didn't break anything | screenshot path fell back to the canvas renderer; bus times are scheduled-only (no realtime); a Sentral cookie's getting stale |
| `error`   | an operation failed                  | a brief didn't print (printer off); a tool call failed; a job gave up after N retries                                          |
| `fatal`   | the app can't run                    | DB won't open; required config missing at boot                                                                                 |

`debug` / `trace` stay available but are unused by default (no high-frequency chatter). So ~4 active levels — not the strict info/error two, but close, and the extra two earn their keep.

## How: wide events (canonical log lines)

One context-rich **structured** event per _unit of work_, built up as the work happens and emitted at the end (in a `finally`). For Chota the units of work are small and few:

- **server start** (`server.start`) — once, at boot
- a **job run** (the 06:45 morning print; each tool refresh) — `defineJob`'s wrapper assembles + emits it
- a **meaningful action** from a request (a print `POST`, a manual refresh, sign-in) — the endpoint emits it
- later, an **agent turn** (one user question → one answer)

We do **not** log every HTTP request — most are dashboard page loads with nothing to say. Within a job we don't log sub-steps either: "the brief data got assembled" is a _field_ on the one `print.brief` event (`sectionsAssembled: 7`), not its own line. (See [Stripe — Canonical Log Lines](https://stripe.com/blog/canonical-log-lines), [Wide Events 101](https://boristane.com/blog/observability-wide-events-101/).)

### Rules

- **Structured, never bare strings.** LogTape's form: a message _template with named placeholders_ plus a props object —
  `log.info("printed {who} brief: {bytes}b via {renderer}", { who, bytes, renderer, durationMs, outcome })`. `jq` on `data/logs/chota.log` then answers questions we didn't anticipate. (`log.debug\`...\`` template-literal form exists for throwaway dev logging — not for the events above.)
- **Terse, factual messages.** `"print failed for {who}: {error}"`, not "Uh oh, the printer seems to be off!". The detail lives in the structured fields (`{ who, error, renderer, errno? }`); the message is a one-liner a human can scan. Computer speaking to the point.
- **Base context on every event.** Set once at boot (via `withContext` or baked into the `event()` helper): `version` (package.json / git SHA), `env` (`dev`/`prod`). One line tells you which build.
- **Business context, not just technical.** `who`/`recipient` (e.g. `kid1`/`kid2`/`family` — actual names come from `chota.config.ts`), `list` (TickTick list name), `kind` (`morning`/`test`), `route`. Aim: "kid2's brief failed because the printer was off", not "print job failed".
- **Correlation id where it's meaningful.** A job run gets a `runId` (= the `job_runs.id`, ties the log line to the DB row); an agent turn gets a `sessionId`. A page load gets nothing.
- **One logger, configured once at startup, imported everywhere** (`src/lib/server/log.ts`). Hierarchical categories map onto today's `[scope]` convention: `getLogger(["chota"])`, `["chota","jobs"]`, `["chota","tool","ticktick"]`, `["chota","print"]`. The `defineJob` wrapper is the "middleware" for jobs (timing/status/emission); endpoints just add their fields.

## What we emit (and what we don't)

| Event                                                                                           | Level                    | Key fields                                                                                                           | Notes                                                                                                                                          |
| ----------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `server.start`                                                                                  | `info`                   | `version`, `env`, `port`, `jobsRegistered`                                                                           | Once at boot — handy to see restarts.                                                                                                          |
| `job.run`                                                                                       | `info` / `error`         | `job`, `runId`, `durationMs`, `outcome`, `summary`, `error?`                                                         | One per job fire. Also writes a `job_runs` row (the `runId`).                                                                                  |
| `print.brief`                                                                                   | `info` / `error`         | `who`, `kind`, `sectionsAssembled`, `bytes`, `renderer: 'screenshot' \| 'canvas'`, `durationMs`, `outcome`, `error?` | When a brief is printed (from the job or a `POST /api/print/...`).                                                                             |
| `tool.<name>` (`tool.ticktick`, `tool.bus`, `tool.sentral`, `tool.weather`, `tool.calendar`, …) | `info` ok / `error` fail | `op` (`refresh`/`fetch`), `count?`, `stop?`/`list?`, `durationMs`, `outcome`, `error?`                               | Refreshes (5–30 min) emit `info` — not noisy. `jq 'select(.category[-1]=="ticktick" and .outcome=="failed")'` tells you how flaky TickTick is. |
| `auth.signin` / `auth.signout`                                                                  | `info`                   | `userId`, `email`                                                                                                    | A breadcrumb; better-auth owns its own tables.                                                                                                 |
| `agent.turn` (when the agent lands)                                                             | `info` / `error`         | `sessionId`, `model`, `tokensIn`, `tokensOut`, `cost_usd`, `tools: [...]`, `outcome`                                 | Cost is a field here — no `cost_log` table.                                                                                                    |
| `qa` (much later, if user Q&A is exposed)                                                       | `info`                   | `question`, `answer`, `cost_usd?`, `sessionId`                                                                       | Just question→answer; skip the agent's internal tool-call chatter.                                                                             |
| Every HTTP request / SvelteKit hook / render internals / cache hits                             | —                        | —                                                                                                                    | **No.**                                                                                                                                        |

## What got built

Packages: `@logtape/logtape` + `@logtape/file`. `src/lib/server/log.ts` is the whole thing — one file. It exports:

- **`configureLogging()`** — sets up the sinks. Idempotent (a `globalThis` flag survives HMR; LogTape throws on a second `configure()`), wrapped in try/catch (a bad sink config must never take the app down). Called once from `hooks.server.ts`'s `init` hook, before `bootJobs()`.
- **`event(category, message, fields)`** — the wide-event emitter. `.set(k,v)` accumulates, `.done(extra?)` emits at `info` with `outcome: 'ok'` + `durationMs`, `.fail(err, extra?)` emits at `error` with `outcome: 'failed'` + `error`. `message` is a LogTape template — `{placeholders}` fill from the fields.
- **`logger(scope)`** — a LogTape logger for ad-hoc structured lines. `logger('tool/ticktick')` → category `['chota','tool','ticktick']`.
- **`log(scope, ...args)` / `logErr(scope, ...args)`** — compat shims for the old `console.log` wrapper. Every existing callsite kept working unchanged; they log at `info` / `error`, joining loose args into a message (braces escaped so a stray `{` isn't read as a placeholder) and pulling Errors into an `error` prop.

Sinks: a **console** sink (human-readable, → stdout → `journalctl` / `npm run logs` on the kiosk), a **rotating file** sink at `data/logs/chota.log` (JSON-lines via `jsonLinesFormatter`, `maxSize` 8 MiB, `maxFiles` 30, `bufferSize: 0`), and — gated on `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` — an **OTLP** sink via `@logtape/otel`. PostHog Logs is the default backend (`https://us.i.posthog.com/i/v1/logs` + `Authorization=Bearer phc_…` in `OTEL_EXPORTER_OTLP_LOGS_HEADERS`); Axiom / Honeycomb / any OTel-native store works the same way. `diagnostics: true` routes the OTel SDK's own warnings through the `['logtape','meta']` logger (which only writes to console+file, never OTel, to avoid an export-failure loop). Base context — `version` (the `<pkgver>+<gitsha>` build stamp from `$app/environment`) and `env` (`dev`/`prod`) — rides every record via `getLogger(['chota']).with({...})`.

`defineJob`'s wrapper (`scheduler.ts`) emits one `job.run` wide event per fire: `const ev = event('jobs', 'job {job} ran', { job: name }); try { ev.done({ summary }); } catch (e) { ev.fail(e); }`. The 20-row `JOBS[].recent` ring buffer stays — it's /admin's at-a-glance view; the log file is the durable record. `runId` joins the event once the `job_runs` table lands (`docs/jobs.md`).

Legacy `log()` / `logErr()` callsites still work via the compat shims — migrate the interesting ones to `event(...)` / `logger(...)` over time; new code uses those directly.

### Deviations from the sketch

- **Console sink stays on in production**, not dev-only. The kiosk has no cloud sink yet, and `journalctl -u chota` / `npm run logs` is the live-troubleshooting path in `docs/deploy.md` — silencing the console there would leave journald empty. Revisit if/when the OTel sink lands.
- **`bufferSize: 0`** (unbuffered) on the file sink — nothing lost on a crash / SIGTERM. Kiosk volume is a handful of events a day, so synchronous writes cost nothing.
- No `withContext` — base context is folded in via `.with()` on the root logger, so it needs no callback scope and covers compat-shim lines too.
- The `['logtape','meta']` logger is wired (LogTape's own diagnostics — a failed sink, a log sent nowhere); the sketched bare `[]` catch-all was dropped (nothing logs outside `['chota']`).

### Gotchas actually hit

- `getRotatingFileSink` opens the file immediately — `configureLogging()` `mkdirSync`s `data/logs/` first or it's `ENOENT` (`deploy.sh` already creates it on the box, but dev needs it too).
- `getChild()` wants a `[string, ...string[]]` tuple, not a plain `string[]` — `'a/b'.split('/')` is the latter. Folded the segments with `.reduce((lg, seg) => lg.getChild(seg), root)`.

### Instrumented / not

Instrumented: server boot, every job run (`job.run`), the per-recipient `print.brief` wide event (from `morning-print`, `weekend-print`, and the `POST /api/print/<kind>` endpoint — fields `who`, `source`, `renderer: 'screenshot' | 'canvas' | 'text'`, `bytes`, `fallback?`, `outcome`, `durationMs`), and — via the still-live compat shims — per-tool refresh lines (`tool.*`), printer, snapshot. Deliberately _not_: HTTP requests, SvelteKit hooks, render internals. `auth.signin` / `agent.turn` are the next migration targets when those flows expand.

## Settled decisions

1. **App version in base context** — done. `version` from `$app/environment` (`<pkgver>+<gitsha>`, set in `svelte.config.js > kit.version.name`) is folded into base context.
2. **`@logtape/pretty` for dev?** — skipped. The plain console sink reads fine.
3. **`withContext`?** — not used. Base context goes in via `.with()` on the root logger instead; once `job_runs` lands, a job's `runId` is just a field on the `job.run` event.
4. **`job_runs` table** — still pending; lands with the retry/catch-up task (`docs/jobs.md`). It's the future source of `runId`.
5. **OTel cloud sink** — built. `@logtape/otel` ships logs to whatever `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` points at; PostHog Logs is the current backend, but it's one env-var change to swap. `diagnostics: true` so export failures surface (not silent 401/404s); `serviceName` defaults to `'chota-bot'` (override with `OTEL_SERVICE_NAME`). Best-effort, batched — if the endpoint is unreachable the kiosk never notices, the file sink stays the always-works path.

## LogTape — practical reference

A hands-on cheat-sheet for the implementation — the design above says _what_ we log; this says _how_ LogTape works. For chota the category root is `['chota']` (the generic guide below uses `['app']`).

### Packages

- `@logtape/logtape` — core
- `@logtape/file` — file / rotating-file sink
- `@logtape/otel` — OTLP export sink (Axiom, Honeycomb, …) — deferred; see the cloud-sink decision above

### Key docs

- https://logtape.org/manual/start — config + logging API
- https://logtape.org/manual/sinks → `/sinks/file`, `/sinks/otel` — sink-specific options live on their own pages, not the manual page
- https://logtape.org/manual/categories — hierarchical loggers

### The pattern

One module owns config; everything else imports loggers from it.

```ts
// log.ts
import { configure, getConsoleSink, getLogger, type Sink } from '@logtape/logtape';
import { getRotatingFileSink } from '@logtape/file';
import { getOpenTelemetrySink } from '@logtape/otel';

let configured = false;

export async function configureLogging() {
  if (configured) return;          // idempotent — guard re-entry
  configured = true;
  try {
    const sinks: Record<string, Sink> = { /* ... */ };
    await configure({
      sinks,
      loggers: [
        { category: ['chota'], lowestLevel: 'info', sinks: [...] },
        { category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['file'] },
      ],
    });
  } catch (err) {
    console.error('LogTape config failed — continuing without it.', err);
  }
}

// Loggers can be created before configure() runs — they resolve lazily.
export const log = {
  jobs: getLogger(['chota', 'jobs']),
  print: getLogger(['chota', 'print']),
};
```

- `configure()` once, at startup — from the framework init hook (SvelteKit `init` in `hooks.server.ts`), **not** module top-level, so env vars are available.
- Wrap it in try/catch. Logging is a side concern; a bad sink config must never take down the app.
- One `log` object, exported. Import that everywhere — don't scatter `getLogger()` calls.
- `category: ['chota']` catches every sub-category (`chota.jobs`, `chota.print`, …) — one entry covers the tree.
- Always add the `['logtape','meta']` logger — that's how LogTape reports a failed sink or a log sent to no logger. Without it those problems are silent.

### Logging API

Use `{placeholder}` matched against a props object — LogTape keeps the structured values, not just the rendered string. That's the whole point vs `console.log`:

```ts
log.jobs.info('{job} ran: {summary} ({ms}ms)', { job, summary, ms });
log.print.error('print failed', { error: err }); // pass Error objects directly
```

Levels: `trace` · `debug` · `info` · `warning` · `error` · `fatal`. `lowestLevel` filters below the threshold.

### Gotchas

- **File sink: the directory must already exist.** `getRotatingFileSink` opens the file immediately (`openSync`) → `ENOENT` if the dir is missing. `mkdirSync(dir,{recursive:true})` first (`data/logs/` — `deploy.sh` already `mkdir -p`s it, but dev needs it too).
- **File sink buffers by default** (8 KiB buffer, 5 s flush) — buffered records are lost on a crash / SIGTERM. For low-volume ops logs, set `bufferSize: 0` → unbuffered, nothing lost on deploy/restart.
- **OTel sink → Axiom:** OTLP/HTTP, no collector needed:
  ```ts
  getOpenTelemetrySink({
  	serviceName: 'chota',
  	otlpExporterConfig: {
  		url: 'https://api.axiom.co/v1/logs',
  		headers: { authorization: `Bearer ${TOKEN}`, 'x-axiom-dataset': DATASET }
  	}
  });
  ```
- **Gate optional sinks on env presence** — only add the OTel sink when the token exists, so local dev + CI need zero setup.
- **Console sink: dev only.** On the kiosk it's noise on top of file + OTLP — `journalctl` already captures stdout.

### Default sink layout

| Sink    | When      | Purpose                             |
| ------- | --------- | ----------------------------------- |
| file    | always    | local, survives, grep-able          |
| otel    | token set | searchable / alertable in the cloud |
| console | dev only  | the terminal while you work         |

### Scope

Instrument the spine first — app errors, failed requests, background jobs, the morning print — then stop. Resist per-function logging; expand only when a real incident shows a blind spot. Keep it distinct from any domain "activity log" shown to users — different audience, different store.

The whole setup is one portable file — copy `log.ts`, swap the category names and env prefix.

## Keeping this doc honest

LogTape is built (`## What got built`). The sections _above_ that heading are the original design — kept because the reasoning is still useful, but they're history, not spec. When the code changes — the OTel sink lands, events migrate off the compat shims — update `## What got built` so a reader sees what logging _is_, not what it was once planned to be.
