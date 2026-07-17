# Jobs

Scheduled work for the kiosk. We use [croner](https://croner.56k.guru) natively — each job is its own `Cron` instance with a standard cron expression. No central dispatcher, no custom schedule helpers, no Job type.

See `src/lib/server/jobs/CLAUDE.md` for the "how to write a job" cheat sheet next to the code.

## The whole API

```ts
import { defineJob } from '..';

defineJob('heartbeat', '*/5 * * * *', () => {
	console.log(`[heartbeat] ${new Date().toISOString()}`);
});
```

Self-contained, no exports. `scheduler.ts > bootJobs()` lazily globs `./jobs/*.ts` and triggers their side-effect registration. Add a file → new job. Delete a file → job gone.

Importing `JOBS` (e.g. from `/admin/jobs`) doesn't start the scheduler — only `bootJobs()` does, and only `hooks.server.ts` calls it. Tests, scripts, prerender don't accidentally fire crons.

## What `defineJob` does

A thin wrapper around croner's `new Cron(...)`:

- Sets `timezone: 'Australia/Sydney'` so patterns are interpreted in local time
- `protect: callback` — overlapping ticks are dropped + logged (no pile-up)
- `catch: callback` — uncaught errors logged, process stays alive
- Wraps `fn` to record start/end into a 20-row ring buffer per job (visible at `/admin/jobs`)
- HMR-safe: re-defining a job by the same name stops the old Cron and replaces

## What we deliberately don't have

| Thing                                     | Why not                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Custom `Job` type                         | Just call `defineJob(name, pattern, fn)`. No struct to maintain                                                                            |
| Schedule helpers (`dailyAt`, `everyTick`) | Cron expressions are the canonical thing. `0 6 * * *` is unambiguous, grep-able, and croner handles all the edge cases (DST, leap seconds) |
| Central dispatcher / "tick" function      | Croner schedules each job itself; we don't need a 5-min tick that figures out who's due                                                    |
| `alreadyRanThisHour` dedup                | Croner won't double-fire and `protect` handles overlaps                                                                                    |
| `withinActiveHours` wrapper               | If a job shouldn't fire overnight, do an early-return in `fn`. Less abstraction, more obvious                                              |
| DB for job history                        | In-memory ring buffer + last-run is enough. Add a `job_runs` table only when we want history across restarts                               |

## File layout

```
src/lib/server/
  scheduler.ts            # defineJob + JOBS + bootJobs + stopJobs
  jobs/
    CLAUDE.md             # "how to write a job"
    heartbeat.ts          # every 5 min: console.log (debug)
    morning-print.ts      # Mon–Fri 06:45: per-person briefs (gated by KIOSK env)
    weekend-print.ts      # Fri 18:00: one whole-family weekend sheet (gated by KIOSK env)
    sentral-refresh.ts    # weekday mornings + 17:30: refresh Sentral .ics caches, one kid at a time
    schoolterms-refresh.ts # Mondays 04:00: refresh the NSW school-calendar cache
    volleyball-refresh.ts # Fridays 06:30 + 17:30: warm the fixture cache before the prints
    sentral-login.ts      # Mondays 04:00: pre-emptive Sentral cookie refresh
    weather-refresh.ts    # warm weather cache
    calendar-refresh.ts   # warm Google Calendar cache
    bus-refresh.ts        # warm bus departures cache
    ticktick-refresh.ts   # warm TickTick lists cache
    dreaming.ts           # daily 03:00: stub, will consolidate memory
src/hooks.server.ts       # init hook: configureLogging + bootJobs + shutdown
src/routes/admin/jobs/    # /admin/jobs page (reads JOBS)
```

Jobs folder is **flat + jobs only**. No framework code in there — `defineJob` lives in `scheduler.ts`. (User-defined jobs from agent prompts will arrive later via a single `dispatch-user-jobs.ts` heartbeat that reads a DB table — see §Future: user-defined jobs.)

## Cron pattern reference

5-field standard cron, interpreted in Sydney time:

| Pattern        | Meaning           |
| -------------- | ----------------- |
| `*/5 * * * *`  | every 5 min       |
| `*/30 * * * *` | every 30 min      |
| `0 * * * *`    | every hour at :00 |
| `45 6 * * *`   | daily at 06:45    |
| `0 4 * * *`    | daily at 04:00    |
| `0 7 * * 1`    | Mondays at 07:00  |
| `0 9 * * 1-5`  | weekdays at 09:00 |

Reference: https://croner.56k.guru/usage/pattern/

## Boot + shutdown

Jobs boot in the `init` hook of `hooks.server.ts` — it runs once at server
startup, after env vars are available:

```ts
export const init: ServerInit = async () => {
	await configureLogging();
	await bootJobs();
	// Stop the crons on SIGTERM/SIGINT so the process exits cleanly.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, stopJobs);
};
```

`stopJobs()` matters: without it, croner's timers keep the event loop alive
after the HTTP server closes, so the process never exits on its own and systemd
SIGKILLs it once the stop timeout elapses.

## Hardening discipline (when agent jobs land)

Bake in from day one. See `docs/agent.md` for the `runAgent` wrapper that enforces these:

1. **`stopWhen: stepCountIs(n)`** on every agent (`ToolLoopAgent` defaults to `stepCountIs(20)`) — prevents infinite loops
2. **`AbortSignal.timeout(...)`** passed to `generate()`/`runAgent` — wall-clock cap
3. **Per-tool fetch timeouts** already in tool wrappers
4. **Wake-gate** in `fn`: cheap pre-check, early return if no signal — avoid waking LLMs when nothing changed
5. **Cost logging** with stable `session_id` like `job-{name}` for cost attribution

## Live jobs

(one file per job in `src/lib/server/jobs/`)

| Name                  | Pattern               | Kind           | Purpose                                                            |
| --------------------- | --------------------- | -------------- | ------------------------------------------------------------------ |
| `heartbeat`           | `*/5 * * * *`         | scripted       | Debug log                                                          |
| `morning-print`       | `45 6 * * 1-5`        | scripted       | Per-person briefs, Mon–Fri (gated by `KIOSK=true`)                 |
| `weekend-print`       | `0 18 * * 5`          | scripted       | Whole-family weekend sheet, Friday evening (gated by `KIOSK=true`) |
| `sentral-refresh`     | `30 6,7,8,17 * * 1-5` | scripted       | Refresh per-kid Sentral .ics caches (serialized)                   |
| `schoolterms-refresh` | `0 4 * * 1`           | scripted       | Refresh the NSW school-calendar cache                              |
| `volleyball-refresh`  | `30 6,17 * * 5`       | scripted       | Warm the volleyball fixture cache before the Friday prints         |
| `sentral-login`       | `0 4 * * 1`           | scripted       | Mondays — pre-emptive Sentral cookie refresh                       |
| `weather-refresh`     | refresh cadence       | scripted       | Warm weather cache                                                 |
| `calendar-refresh`    | refresh cadence       | scripted       | Warm Google Calendar cache                                         |
| `bus-refresh`         | refresh cadence       | scripted       | Warm bus departures cache                                          |
| `ticktick-refresh`    | refresh cadence       | scripted       | Warm TickTick lists cache                                          |
| `dreaming`            | `0 3 * * *`           | agent (Sonnet) | Stub — will consolidate memory once agent lands                    |

Planned:

| Name           | Pattern       | Kind                  | Purpose                                        |
| -------------- | ------------- | --------------------- | ---------------------------------------------- |
| `enrich-lists` | `*/5 * * * *` | scripted (wake-gated) | TMDB-enrich new movies/tv                      |
| `weekly-news`  | `0 7 * * 1`   | agent (Haiku)         | Search Exa for kid-friendly news, add to Notes |

## Future: user-defined jobs

**Reference: [`~/code/everx/docs/jobs.md`](../../everx/docs/jobs.md)** — a portable, current (Jun 2026) design note distilled from three reference implementations (openclaw, hermes-agent, eve) plus everx's own build. Read it before building this. The takeaways below are chota-specific.

The single most important idea: **system jobs and user jobs are two different things — keep them in separate homes.**

- **System jobs = code.** Fixed schedule, no owner, same every deploy (our morning-print, refreshes, dreaming). One self-registering `defineJob()` file each. **chota already does this and it's correct — don't change it.** Croner self-schedules each; there is no dispatcher and no `next_run_at` to manage.
- **User jobs = data.** Created at runtime ("hey Chota, every Monday tell me which library books are due"). Per-owner, arbitrary schedule, editable without a deploy. These live in a **table**, and **one new system job — a dispatcher heartbeat — processes that table.** That's the whole relationship: the dispatcher is a `defineJob`, the user jobs are its rows.

> Our current `heartbeat.ts` (every 5 min, console.log) is a liveness debug log, **not** this dispatcher. When user jobs land, add a separate `dispatch-user-jobs.ts` — don't overload heartbeat.

What to steal when we build it (all detailed in the everx doc):

1. **`computeNextRun(job, from) → ts | null`** — one pure function, exhaustively unit-tested with a case table. Delegate DST/month-length to croner (we already depend on it): translate friendly fields → cron expr → `new Cron(expr, { timezone }).nextRun(from)`. `cadence` and one-time `none` are the only two computed by hand. **Prove DST with a test that actually straddles a boundary** (a 01:00 job straddles a 03:00 switch; a 10:00 job never does).
2. **`next_run_at <= now` dispatch.** The tick query is `WHERE enabled AND next_run_at <= now`. This one predicate subsumes _due-now_, _missed-while-down_, and _failed-last-time_ — no catch-up branch, no ±window scan, self-healing. **Index `(enabled, next_run_at)` from day one.**
3. **Heartbeat interval = worst-case lateness = cadence floor.** Prefer **1 min** over 5 — the indexed query usually returns zero rows, effectively free, and coarser only buys lateness. (chota is single-process, so a fixed tick is plenty; skip openclaw's self-scheduling `setTimeout`.)
4. **Claim with a visible lease, recover on boot.** Atomic `UPDATE … SET last_error='_running_', running_at=now WHERE id=? AND last_error!='_running_'` is the overlap guard; on boot, reset rows stuck in `_running_` past a lease (~2h) to failed. **Never advance `next_run_at` before running** — a crash then silently drops the job; the lease leaves visible evidence instead.
5. **Snapshot the timezone into the row at create time** — a schedule should mean what it meant when created.
6. **An agent job is mostly a stored prompt.** Translate the user's one-liner into a holistic prompt + per-job `model` + `tools` scope, and at fire time feed it to **our existing `chotaAgent`** (we have exactly one agent — see `docs/agent.md`). No specialized agents until a pattern repeats 3×. This is the mechanism for "crystallize repeated chat asks into jobs."
7. **Cost: per-run record + per-job cap.** Reuse a session/run table with a nullable `source_job_id` (a job run is a session a job produced); cap with `cost_cap_usd` → disable + notify on hit. Our `agent.run` wide event already captures usage per call — a DB row makes it queryable.

**Build order (each step inert until the last):** `computeNextRun` + tests → schema (`user_jobs` table + index, `source_job_id`) → creation path (one-liner → holistic prompt) → **the dispatcher last** (the only step that makes anything fire). Defer the whole thing until there's a real ask.

## Future: agent jobs that need code execution

Some research-style agent jobs may benefit from a sandbox to run generated code. Two paths to evaluate when the need arises:

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) — micro-VM for ephemeral code execution
- [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool) — bash tool with sandboxing primitives

For now, all agent tools are typed wrappers around external APIs — no code-exec needed.
