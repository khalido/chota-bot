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
- Records every fire (ok, error, skipped stale) in the `job_run` table — kept 30 days, visible at `/admin/jobs` and in `/api/health`, and it survives restarts
- Caps each run at 10 min (`{ timeoutMs }` to change): a hung print or browser call fails and alerts instead of blocking every later tick. The work isn't cancelled, it just stops holding the job
- HMR-safe: re-defining a job by the same name stops the old Cron and replaces
- A throw fails the run and raises the `job:<name>` alert; the next ok run clears it (see §Alerts). Options: `{ logOk: false }` for frequent checks (failures still log), `{ alertAfter: 3 }` so a refresh needs 3 failures in a row before it alerts.

A job that does several things (a print per person, a refresh per kid) tries them all, then throws naming what failed — never returns ok with "FAILED" in its summary.

## Alerts

`#lib/server/alerts.ts`: `raiseAlert(key, text)` and `clearAlert(key, { okNeeded, recovered })`. One row per key in the `alert` table — state, not history (the log has every event):

- First raise sends `⚠️ text`; while open, quiet; a repeat only after 12h.
- `clearAlert` closes after `okNeeded` good checks in a row (2 for a device that flaps) and sends `✅ …` only if the problem was sent.
- A deploy or restart doesn't resend open alerts (the table persists).
- Delivered on the channel in `chota.config.ts > alerts.channel` (default Telegram, to `telegram.notifyChatIds`); the transport registers itself at boot. During `alerts.quietHours` they arrive silent. Alerting never throws.
- `/admin/jobs` lists recent alerts and has a "Send test alert" button (sends ⚠️ then ✅).

**Missed runs.** A print that never ran raises nothing by itself — the box was off or restarting at 06:45, a deploy cut the run off, or the fire was skipped as stale. `job-check` (every 30 min, kiosk only) looks at the last slot of `morning-print` and `weekend-print`: past 30 min with no ok or error row in `job_run` → `Job morning-print missed its 06:45 run` on the job's own `job:<name>` key, so the next ok run sends "working again". Slots older than 12h aren't checked, so a weekend off sends one message, not a stream of repeats. No catch-up print.

Planned on top: per-person targets (an alert to a kid, via their channel); `/mute <key>` once the commands registry exists.

**Device checks:** `printer-check` (every 15 min at :05, :20, :35, :50, kiosk only) asks the thermal printer for status over USB (`DLE EOT 1–4`, read back on the bulk IN endpoint; `readPrinterStatus` in `print/printer.ts`). It uses no paper and skips a tick while a print is running. Paper out, cover open, a cutter or other error, or the printer missing from USB raises the `printer` alert (`Printer: paper out`); two good checks in a row send "Printer is working again". A low roll has its own key, `printer:paper-low`, so it can't mute "paper out" later. A status byte that doesn't fit Epson's layout goes into the alert as hex rather than being guessed at. Ok runs aren't logged. Read off the MUNBYN on the Pi (10 Nov 2026): `16 12 12 12` online with paper, `1e 36 12 72` cover open, `1e 32 12 72` roll out with the cover shut. With the cover open the paper sensor reads empty too, so that state is reported as "cover open" alone. This printer showed no near-end reading, so "paper low" may never fire on it. Not built: the morning/weekend prints running the same check first and failing with the reason. The laser can get a reachability check the same way later — but as status, not an alert, since it's off most of the time.

Learned from hermes-agent (`refs/hermes-agent/cron/incidents.py`, `gateway/cron_store_notices.py`): alert on transitions, not on every poll; no lone "recovered"; close incidents on recovery or they pile up as "open" forever. Not taken: its run ledger, leases, retry queue, catch-up runs (a 06:45 print at 11:00 is worse than none) — that's multi-process machinery.

## What we deliberately don't have

| Thing                                     | Why not                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Custom `Job` type                         | Just call `defineJob(name, pattern, fn)`. No struct to maintain                                                                            |
| Schedule helpers (`dailyAt`, `everyTick`) | Cron expressions are the canonical thing. `0 6 * * *` is unambiguous, grep-able, and croner handles all the edge cases (DST, leap seconds) |
| Central dispatcher / "tick" function      | Croner schedules each job itself; we don't need a 5-min tick that figures out who's due                                                    |
| `alreadyRanThisHour` dedup                | Croner won't double-fire and `protect` handles overlaps                                                                                    |
| `withinActiveHours` wrapper               | If a job shouldn't fire overnight, do an early-return in `fn`. Less abstraction, more obvious                                              |

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
    weather-refresh.ts    # warm weather cache (sky + sea: also warms the beach report)
    calendar-refresh.ts   # warm Google Calendar cache
    bus-refresh.ts        # warm bus departures cache
    ticktick-refresh.ts   # warm TickTick lists cache
    job-check.ts          # every 30 min: alert when a print's slot passed with no run
    printer-check.ts      # every 15 min: alert when the printer is offline, open or out of paper
    job-runs-prune.ts     # daily 03:30: drop job_run rows older than 30 days
    dreaming.ts           # daily 03:00: stub, will consolidate memory
src/hooks.server.ts       # init hook: configureLogging + bootJobs + shutdown
src/routes/admin/jobs/    # /admin/jobs page (reads JOBS)
```

Jobs folder is **flat + jobs only**. No framework code in there — `defineJob` lives in `scheduler.ts`. (Jobs made in chat will be rows in a table, fired by one system job, `user-jobs.ts` — see §User jobs.)

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
	await bootChannels(); // first, so alert channels exist before any job fails
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

| Name                  | Pattern               | Kind     | Purpose                                                                                    |
| --------------------- | --------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `heartbeat`           | `*/5 * * * *`         | scripted | Debug log                                                                                  |
| `morning-print`       | `45 6 * * 1-5`        | scripted | Per-person briefs, Mon–Fri (gated by `KIOSK=true`)                                         |
| `weekend-print`       | `0 18 * * 5`          | scripted | Whole-family weekend sheet, Friday evening (gated by `KIOSK=true`)                         |
| `sentral-refresh`     | `30 6,7,8,17 * * 1-5` | scripted | Refresh per-kid Sentral .ics caches (serialized)                                           |
| `schoolterms-refresh` | `0 4 * * 1`           | scripted | Refresh the NSW school-calendar cache                                                      |
| `volleyball-refresh`  | `30 6,17 * * 5`       | scripted | Warm the volleyball fixture cache before the Friday prints                                 |
| `sentral-login`       | `0 4 * * 1`           | scripted | Mondays — pre-emptive Sentral cookie refresh                                               |
| `weather-refresh`     | `*/30 * * * *`        | scripted | Warm weather cache + the local beach lifeguard report                                      |
| `calendar-refresh`    | refresh cadence       | scripted | Warm Google Calendar cache                                                                 |
| `bus-refresh`         | refresh cadence       | scripted | Warm bus departures cache                                                                  |
| `ticktick-refresh`    | refresh cadence       | scripted | Warm TickTick lists cache                                                                  |
| `job-check`           | `*/30 * * * *`        | scripted | Alert when a print's slot passed with no run (gated by `KIOSK=true`)                       |
| `printer-check`       | `5-59/15 * * * *`     | scripted | Alert when the printer can't print: offline, cover open, paper out (gated by `KIOSK=true`) |
| `user-jobs`           | `* * * * *`           | scripted | Send the reminders that are due (gated by `KIOSK=true`); idle ticks aren't stored          |
| `job-runs-prune`      | `30 3 * * *`          | scripted | Drop `job_run` rows older than 30 days                                                     |
| `dreaming`            | `0 3 * * *`           | stub     | No-op placeholder — will consolidate memory once agent-jobs land                           |

Planned:

| Name           | Pattern       | Kind                  | Purpose                                        |
| -------------- | ------------- | --------------------- | ---------------------------------------------- |
| `enrich-lists` | `*/5 * * * *` | scripted (wake-gated) | TMDB-enrich new movies/tv                      |
| `weekly-news`  | `0 7 * * 1`   | agent (Haiku)         | Search Exa for kid-friendly news, add to Notes |

## User jobs: reminders and scheduled asks

**Built 12 Nov 2026: plain reminders.** The `user_job` table, `#lib/server/userjobs.ts` (rules, schedule maths, `dispatchDue`), the `schedule` chat tool, `jobs/user-jobs.ts`, and a read-only phone page at `/me/<who>` (`docs/phone.md`). Not built: scheduled asks (the `ask` kind, `job_result`, the cost cap), the `run` action, the `/admin/jobs` list.

Where the build differs from the design below:

- **Delivered in the chat it was made in.** Config has no person-to-chat map, so the rules follow the chat: a direct message holds only your own reminders; one for someone else or for everyone is made in the family group, and arrives there with the person's name. Any repeat in a group needs a parent.
- **No `running_at` claim.** Sends are awaited inside one tick in one process, and croner's `protect` drops an overlapping tick. The claim comes back with `ask` runs, which aren't awaited.
- **A failed send never gives up.** `next_run_at` stays at the slot it was due and `retry_at` holds the next try (30 s, 1 min, 5 min, 15 min, then hourly). After five failures a parent gets an alert and it keeps trying, so the reminder goes out marked late, or as "missed" past 12 hours, when the channel is back. Nothing is switched off.
- **A one-off is deleted once sent.** The chat history and the log keep the record. `enabled = false` means paused, nothing else.
- **Quiet hours are not applied:** a channel's `send` has no silent option.
- **`create` also takes `inMinutes`.** The model is told the date and time but shouldn't do clock arithmetic.
- **No `job_run` row per reminder.** The tick stores a run when it sent or is waiting on something, not when idle (`recordIdle: false`).
- **The owner isn't told when a send keeps failing:** the failing channel is the way to reach them. The alert goes to the alert channel.

One jobs system, two homes:

- **System jobs are code.** Fixed schedule, no owner, the same on every deploy: the prints, the refreshes, the checks. One `defineJob()` file each, as above. Croner schedules each one; nothing to dispatch.
- **User jobs are rows.** Made in chat ("remind me at 4 to leave for volleyball", "every Monday tell me which library books are due"). They have an owner, any schedule, and change without a deploy. They live in the `user_job` table, and one system job, `user-jobs`, runs every minute and fires the rows that are due.

There is no separate heartbeat. A regular "anything worth telling the family?" check is a user job with a prompt and the silence rule below. OpenClaw folded its heartbeat into ordinary jobs for the same reason, and hermes-agent never had one. Today's `heartbeat.ts` is a scheduler smoke test and has nothing to do with this.

Surveyed 11–12 Nov 2026: [`~/code/everx/docs/jobs.md`](../../everx/docs/jobs.md) and its dispatcher (the closest to chota: croner, one process, SQLite), `syntechfibres.dev/docs/jobs.md` §9 (a review of everx's build three weeks on), `refs/hermes-agent/cron/`, `refs/openclaw/src/cron/` and its automation docs, and `refs/eve` (Vercel's agent; `docs/schedules.mdx`, `docs/experimental/dynamic-schedules.mdx`).

**Croner stays.** Checked 12 Nov 2026 against Bun's built-in `Bun.cron`, node-cron, cron, node-schedule, toad-scheduler (wraps croner) and bree: croner is the only one with timezones, overlap protection and a plain next-run-after-T calculation in one package, and OpenClaw uses it for the same maths. chota is on 11.0.0, which changed DST behaviour (a job in the spring-forward gap now runs at the first valid time after it) and has more DST fixes queued for 11.0.1; take that release when it lands. No chota job sits in Sydney's 02:00–03:00 gap.

**Every minute, not every five.** The tick is one indexed query that nearly always returns nothing. The interval is how late a reminder can be, and "at 4:00" arriving at 4:04 is a miss.

### Reminders and TickTick

TickTick is the store for lists and to-dos: it brings the phone app, sharing and tick-off, and all access goes through `tools/ticktick.ts`, so it can be swapped later. The bot keeps no lists of its own. A reminder goes where its meaning puts it:

| The ask                                    | Where it lives                           |
| ------------------------------------------ | ---------------------------------------- |
| "Remind me to book the dentist"            | TickTick, with a due date (as today)     |
| "Remind me at 4 to leave for volleyball"   | A `remind` job                           |
| "Remind me Friday 5pm to book the dentist" | Both: the to-do, and a job that names it |

A to-do needs ticking off and shows on the morning brief; a ping at a time has nothing to tick. Chasing open to-dos (anything due today and still open at 17:00) is one system job in code, not a job per item.

The same split applies to watching things. "Tell me when this film is out" for one film is an `ask` job. Checking the whole watch list against release dates is a system job, cheaper and steadier than a model run per title.

### Two kinds

| Kind     | What fires                                                         | Model call |
| -------- | ------------------------------------------------------------------ | ---------- |
| `remind` | Sends the stored text: `⏰ Leave for volleyball`                   | None       |
| `ask`    | Runs `chotaAgent` on the stored prompt and sends the reply, if any | One run    |

Most family asks are `remind`. It costs nothing and can't go wrong in interesting ways, so the tool description steers the model to it unless the answer has to be worked out at fire time.

### The chat tool

One tool, `schedule`, with an `action`: `create`, `list`, `update`, `pause`, `resume`, `remove`, `run`. hermes-agent and OpenClaw both use one tool with an action; eve generates a tool per operation, which would add seven tools to the bot's list. The description tells the model to:

- `list` before it changes or removes anything, and never guess an id.
- Not make a second copy when a `list` comes back empty or fails; say so instead.
- Say the schedule and the task back in plain words before creating a repeating job (OpenClaw's rule). A one-off reminder needs no confirmation.
- Use it for future work only, never for something to do now.

`list` returns the asker's own jobs (a parent can ask for someone else's or the group's): id, kind, text cut to 60 characters, the schedule in words, next run, last result. In chat the bot shows one line per job, soonest first, at most ten, then "and N more". `prompts.ts` gets that rule, and loses its line saying the bot can't send a message at an exact time.

`run` fires a job once now, as a test. After creating an `ask` job the bot offers it, so the first result isn't a surprise next Monday.

`create` takes:

- `kind`: `remind` or `ask`
- `text`: the reminder text, written to read as a reminder when it arrives ("Leave for volleyball", not "that thing"), or for `ask` a prompt that stands on its own (the run has no chat history) and says when to stay quiet and when the job is finished
- `at`: a local date and time (`2026-11-12T16:00`) for a one-off, **or** `cron`: a 5-field pattern in Sydney time for a repeat. The model turns "every weekday at 7" into `0 7 * * 1-5` itself; it already gets today's date. No third format.
- `for`: a family member, or `group`. Left out, it means the asker.

Who is asking comes from the call options (`asker`), never from the model. Rules, enforced in the tool and not in the prompt:

- Anyone can make, see and remove a job for themselves.
- Only a parent can make one for someone else, or a repeating one for the group.
- A job is never created on a quiet turn (the bot overhearing the group), and never from inside a job run.
- The model can't pick the model or the tools a job runs with.
- Limits: 20 open jobs per person. A `remind` repeats every 5 min at most, an `ask` every 15 min. The tick is every minute so a job fires on time, not so a job can run every minute.

### The table

`user_job`: `id`, `owner`, `created_by`, `kind`, `text`, `cron` or `run_at`, `timezone` (copied in at create time, so a schedule keeps meaning what it meant), `deliver_to` (a session key: the owner's own chat, or the group), `enabled`, `next_run_at`, `running_at`, `error_count`, `last_error`, `last_message` (what the last run sent), `cost_usd_total`, `created_at`. Index `(enabled, next_run_at)`.

Add a column only when the code that reads it ships. everx carries two that nothing reads (`workingHoursOnly`, `tools`).

`computeNextRun(job, from)` is one pure function: a one-off returns its time once, a repeat asks croner (`new Cron(expr, { timezone }).nextRun(from)`), so DST and month lengths are croner's problem. Test it with a table of cases, one of which crosses a DST change at the job's own hour.

### The dispatcher

`jobs/user-jobs.ts`, `* * * * *`, kiosk only (a dev Mac must never send a reminder). Each tick:

1. Reset rows whose `running_at` is over 30 min old to failed. Also done once at boot.
2. Take up to 25 rows `WHERE enabled AND next_run_at <= now AND running_at IS NULL`.
3. Claim each with `UPDATE … SET running_at = now WHERE id = ? AND running_at IS NULL`. No row changed means another tick has it.
4. A `remind` is sent inside the tick. An `ask` is started and **not awaited**: the tick returns straight away, and the run sets `next_run_at` (or disables a finished one-off) and clears `running_at` when it ends. Croner's `protect` drops a tick while the last one is still going, so a tick that waited on a 3-minute run would make every reminder due in those minutes late.
5. At most 2 `ask` runs at once (a Pi, and one shared browser lock). A third stays unclaimed and goes on the next tick with a free slot.

**"Already running"** is the `running_at` stamp, set by the claim in step 3. While it is set the row is invisible to every later tick, so a long job can't start twice, and `schedule list` shows it as "running since 07:00". A job whose next slot comes round while it is still running skips that slot; it doesn't queue a second run.

`next_run_at <= now` covers due now, missed while the box was off, and failed last time, with no catch-up code. `next_run_at` moves only after the run. hermes-agent moves it first, so a crash loses that run without a trace; for a reminder, late is better than lost.

**Late runs.** A reminder up to 12h late is sent with "(late: was for 16:00)". Older than that, the owner gets one line saying it was missed. Nothing is dropped without a message.

**Failures.** Retry after 30s, 1m, 5m, 15m, 1h, or the next natural slot if that is later. After 5 in a row the job is disabled, the owner is told, and `raiseAlert('user-job:<id>', …)` fires.

**Quiet hours.** Delivered silently during `alerts.quietHours`, not held back. Someone who asks for a 05:30 reminder means it.

### What an `ask` run does

- A fresh `chotaAgent` run as the owner (their `asker`, so privacy rules hold). The stored prompt is the user turn.
- A block appended last to the system prompt: this is a scheduled run and its time; nobody is there to answer a question; the reply is sent to the owner as is, so no preamble; `schedule` is not available. The block is fixed text, so it caches.
- The run ends by calling `job_result`, a tool that exists only in job runs and stops the loop (eve's `no_reply` tool, widened). It takes an `outcome`:
  - `nothing`: send nothing. "The film isn't out yet."
  - `tell`: send `message`.
  - `done`: send `message` and disable the job. "It's out on Thursday" ends a watch.
- A plain text reply with no `job_result` call counts as `tell`. A tool call is harder to get half right than an exact token such as `[SILENT]` or `NO_REPLY`, which hermes-agent and OpenClaw match on.
- The last `tell` or `done` message is given to the next run, so a repeating job doesn't say the same thing twice.
- A silent run is still recorded.
- Read tools only. A job gets a write tool (adding to a list, printing, announcing) only when its creator asked for that in so many words; it is stored on the job. Add that column when the first such job exists.
- 2 minute time limit, step limit as in chat. Cost is added to `cost_usd_total`; over US$1 the job is disabled and the owner told.

### Where the result goes, and the record

The message goes out through the channel router to `deliver_to`, and is recorded with `recordSent(sessionKey, text, channel)`, the same call alerts use. So when someone replies "why?" or "push it an hour", the bot already has the message in that chat's history. Each fire also writes a `job_run` row named `user:<id>`, so `/admin/jobs` and the 30-day prune cover user jobs with no new code. `/admin/jobs` gets a second list: every user job with owner, schedule, next run, last result, and pause and delete buttons.

### Showing jobs in TickTick (after reminders work)

The `user_job` table is the truth. TickTick is where the family sees jobs and makes a few safe edits. Each job is mirrored as one task in the bot's list (KO may rename the family list "Chota"), in a "Reminders" or "Jobs" section, and the row stores the task's id.

| Edit made in the app                                                       | What the bot does                                             |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Tick it off                                                                | Cancels the job (a finished one-off is ticked off by the bot) |
| Delete it                                                                  | Removes the job                                               |
| New due time on a one-off, valid and in the future                         | Takes it                                                      |
| New title on a `remind`                                                    | Takes it                                                      |
| Anything else (a repeat rule, an `ask` job's text, a move to another list) | Puts the task back and tells the owner in chat why            |

An edit passes the same checks as a chat request before it touches the row. An `ask` job's task title is a plain summary ("Mondays 7am: library books due"); the prompt stays in the table.

What the API allows (checked 12 Nov 2026 against `developer.ticktick.com/docs/openapi.md`; nothing called live):

- **Our lib talks to TickTick's hosted MCP server, not the REST API.** It uses five MCP tools and has no update, delete or assign. The mirror needs those, so it means a REST client (`api.ticktick.com/open/v1`, personal API token) built beside the MCP one.
- **No webhooks or change feed.** Seeing an edit means reading the list and comparing by task id and `etag`. A task that disappears was completed or deleted; `POST task/completed` tells which.
- **Timed tasks are supported**: `dueDate` with a time, `isAllDay: false`, `timeZone`, `reminders: ["TRIGGER:PT0S"]`, and `repeatFlag` as an RRULE.
- **No hidden field** to tag a task as the bot's. The link is the task id in our row.

Tested on the family list, 12 Nov 2026, with a throwaway task (since deleted):

- The existing `TICKTICK_API_KEY` works as a REST Bearer token. No second key.
- Create and update accept `columnId`; an update moves a task between sections. Tasks come back with `columnId`, `columnName`, `etag` and `modifiedTime`, none of which are in the docs.
- An update is partial: sending only `title` kept the due time and alarm. Every write changes `etag`.
- A ticked-off task leaves `project/{id}/data` and a get by id returns `status: 2` with `completedTime`.
- A deleted open task also leaves `/data`, and a get by id still returns it with `status: 0`. So: gone from the list and `status 2` is ticked off; gone and `status 0` is deleted.
- Not known yet: whether the timed task's alarm reached a phone (KO to say), and whose phone gets it for an assigned task.

If the alarm does notify, mirrored tasks carry no alarm, or the bot's own ping is turned off for that person: one or the other, never both.

**Decided 12 Nov: not now.** Reminders are built on the table alone, with no TickTick dependency. KO is weighing chota's own surfaces for lists (pages built from a chat ask, `docs/artifacts.md`; later an Android app), and a mirror would tie jobs to a store that may be replaced. The findings above stay for when it's wanted.

Order: reminders with the table and the chat list first; then the one-way mirror (bot → TickTick); then taking edits back. Each is useful alone, and the two-way part is most of the work.

### Build order

Each step does nothing visible until the last.

1. `computeNextRun` and its case table.
2. The `user_job` table and index.
3. The `schedule` tool with the permission rules, tested with example chats. Jobs can be made and listed but nothing fires.
4. The `remind` path of the dispatcher. This is the first version worth shipping.
5. The `ask` path: prompt block, `job_result`, cost cap.
6. The `/admin/jobs` list.

Later, when asked for: a cheap check before the model runs (skip when a watched page or list hasn't changed); promoting a repeated chat ask into a job on the bot's suggestion.

## Future: agent jobs that need code execution

Some research-style agent jobs may benefit from a sandbox to run generated code. Two paths to evaluate when the need arises:

- [Vercel Sandbox](https://vercel.com/docs/vercel-sandbox) — micro-VM for ephemeral code execution
- [vercel-labs/bash-tool](https://github.com/vercel-labs/bash-tool) — bash tool with sandboxing primitives

For now, all agent tools are typed wrappers around external APIs — no code-exec needed.
