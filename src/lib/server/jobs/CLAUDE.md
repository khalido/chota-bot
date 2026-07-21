# Jobs folder

Each `.ts` file in here is one scheduled job. Files self-register via `defineJob()` at module top-level — no exports, no manual registry. Auto-discovered by `$lib/server/scheduler.ts > bootJobs()` when the server starts.

## Adding a job

Drop a TS file. Three lines + import + a top comment:

```ts
// Warm the widget cache every 10 minutes (illustrative — pick your own name).
import { defineJob } from '$lib/server/scheduler';

defineJob('widget-refresh', '*/10 * * * *', async () => {
	invalidateCache();
	await getWidgets();
});
```

## Conventions

- **Filename = job name** (kebab-case): `ticktick-refresh.ts` → `'ticktick-refresh'`
- **One-line comment at the top** describing what the job does — this is the only doc, so make it count
- **One `defineJob` call per file** — don't pile multiple jobs into one file

## Cron pattern (5-field, Sydney time)

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

## What `defineJob` gives you

A thin wrapper around croner's `new Cron(...)`:

- Sets `timezone: 'Australia/Sydney'` so patterns are local
- `protect` — overlapping ticks are dropped + logged (no pile-up if a job runs slow)
- `catch` — uncaught errors logged, process stays alive
- 20-row in-memory ring buffer per job, visible at `/admin/jobs`
- HMR-safe: same name → stop old Cron and replace

## Wake-gate before LLM calls

If a job calls an agent, do a cheap pre-check first:

```ts
defineJob('enrich-lists', '*/5 * * * *', async () => {
	const movies = await getList('movies');
	const unenriched = movies?.tasks.filter((t) => !t.content?.includes(BOT_MARKER)) ?? [];
	if (unenriched.length === 0) return; // skip the LLM, save cost
	// ...
});
```

## Hardening for agent jobs

```ts
defineJob('weekly-news', '0 7 * * 1', async () => {
	await runAgent({
		prompt: '...',
		stopWhen: stepCountIs(8), // hard cap on tool-call loops
		abortSignal: AbortSignal.timeout(60_000) // wall-clock cap
	});
});
```

`runAgent` lives in `$lib/server/agent` — built and exported (Telegram drives the streaming variant `runAgentStream`); no cron job calls it yet. See `docs/agent.md` for the exact signature before wiring the first agent job.

## Future: user-defined jobs

Eventually one job here will be `run-user-jobs.ts` — every 5 min, read a `user_jobs` DB table, and execute any due rows by invoking the agent with the row's prompt + tool whitelist. Lets users say "hey Chota, every Monday tell me X" and have it scheduled. The agent runtime exists (`runAgent` / `runAgentStream`); the user-jobs table + dispatcher are what's still unbuilt.

## Don't

- Don't import jobs from outside this folder — they're side-effect modules
- Don't `console.log` inside `fn`, and don't hand-log the run — `defineJob`'s wrapper emits one `job.run` wide event per fire (return a summary string and it rides along). For an incidental line use `logger('jobs')` from `$lib/server/log`.
- Don't re-throw inside `fn` — the wrapper records errors and the job continues on the next tick
- Don't add a "framework" file here — `defineJob` lives in `$lib/server/scheduler`. This folder is jobs only.
