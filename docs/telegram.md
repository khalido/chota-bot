# Telegram bot

**Status: chat + streaming + thinking + on-demand prints shipped (June 2026); voice still Phase 3.** `src/lib/server/telegram/bot.ts` boots a long-polling bot from `hooks.server.ts`. A whitelist middleware gates everything (except `/start` onboarding). Handlers: `/start` (greet + hand back the chat ID), `/print [who]` (sends a brief PNG — the same image the printer renders — with an inline-keyboard recipient picker when no arg), and `message:text` → `runAgentStream()` → reply **streamed live as a Bot API 10.1 Rich Message**. While the agent runs tools the draft shows a native **`<tg-thinking>` block** ("Checking the calendar…"); once text arrives it switches to the answer, persisted with `sendRichMessage` (plain-reply fallback). Verified end-to-end against @ko_chota_bot. Voice → Whisper and Mini Apps remain ahead. This doc captures the decisions; the shipped code is the minimum-viable sketch below, made real.

> **Bot API available: 10.2** via `grammy@^1.45.0` (bumped July 2026; no code changes from 1.44). The code currently _uses_ the 10.1 surface — **Rich Messages** with `sendRichMessageDraft` for _streaming structured AI replies_ (see §Decisions). 10.2 additions relevant to us (ephemeral group replies, media inside rich messages) are catalogued in §grammY notes below. [Bot API changelog](https://core.telegram.org/bots/api-changelog).

## Decisions

- **Wrapper: [grammY](https://grammy.dev)** (`grammy` on npm — **in `package.json` at ^1.45.0**; ^1.43 → ^1.44 landed Bot API 10.1's Rich Messages, ^1.45 landed 10.2; this superseded the original gramio pick, see table below). The de-facto TypeScript standard: mature 1.x (no pre-1.0 churn), the largest plugin ecosystem (`@grammyjs/auto-retry`, stream plugin, sessions, menus), excellent docs. Trade-off accepted: it lags new Bot API releases by days-to-weeks where gramio ships same-day — at family scale, bleeding-edge Bot API features matter less than stability. _(Doc updated June 2026 — it previously still said gramio while grammy sat in package.json.)_
- **Long polling, not webhooks** ([grammY deployment types](https://grammy.dev/guide/deployment-types) · [getting started](https://grammy.dev/guide/getting-started#getting-started-on-node-js)). `bot.start()` runs an outbound `getUpdates` loop inside the existing Node process — outbound TCP, works through home NAT for free, no public URL, no second service. Webhooks need a public HTTPS endpoint Telegram can POST to (port 443/80/88/8443 only); family-scale traffic doesn't need the throughput they offer. (Tailscale Funnel could expose a webhook URL — considered and explicitly ruled out, adds infra surface for zero gain at our scale. Reserve Funnel for hosting Mini Apps later, which genuinely needs public HTTPS.)
- **Whitelist by chat ID.** Family members' Telegram user/chat IDs in `chota.config.ts > telegram.allowedChatIds`. First-message-from-anyone-else is silently dropped. No "LLM moderation" for inbound — see §Anti-patterns.
- **Streaming via Rich Messages — `sendRichMessageDraft` (Bot API 10.1, Jun 2026).** _Revised from the earlier `sendMessageDraft` (9.5) plan._ 10.1's headline feature is **Rich Messages**: Telegram now has a first-class type for "send/stream a structured AI reply." `sendRichMessageDraft()` streams partial rich messages _as the model generates_, and `editMessageText()` accepts a `rich_message` parameter to finalise. Rich blocks map cleanly onto an agent's structured output — `RichBlockSectionHeading`, `RichBlockList`, `RichBlockTable`, `RichBlockPreformatted` (code), `RichBlockBlockQuotation`, `RichBlockDetails` (collapsible), `RichBlockMathematicalExpression`, and notably `RichBlockThinking` (a fold-away reasoning block — a clean home for the agent's tool-call trace without cluttering the answer). With grammY 1.44 these are typed methods on `bot.api` (positional args: `sendRichMessageDraft(chat_id, draft_id, { markdown })`, `sendRichMessage(chat_id, { markdown })`). **Shipped** as `streamRichReply()` in `telegram/stream.ts`, driven by the agent's **`fullStream`** (not just `textStream`) so it can react to tool calls: on a `tool-input-start` part it shows a `<tg-thinking>` draft ("Checking the calendar…" — the native thinking status, which is **draft-only**, sent as `html: '<tg-thinking>…</tg-thinking>'`); on `text-delta` it switches the draft to the accumulating Markdown answer; at the end it persists once with `sendRichMessage` (the draft is an ephemeral ~30s preview). `InputRichMessage` accepts a `markdown`/`html` string directly, so the agent's Markdown flows through — no hand-built `RichBlock` tree. Any rich-method error flips to a single plain `ctx.reply`.

Hardened per a grammY-refs review (June 2026): `@grammyjs/auto-retry` on `bot.api` (429 retry on outgoing calls — grammY only auto-retries getMe/deleteWebhook); a `.catch` on `bot.start()` (a 401 bad-token or 409 two-pollers rejects there — otherwise a silent unhandled-rejection crash); `drop_pending_updates: true` (don't answer messages queued while the box was down); `setMyCommands` (so `/start` + `/print` show in the command menu); a typing-action renewal loop (the status expires after 5s, the agent runs longer); and `stopBot()` drains in-flight handlers before `shutdownLogging()` so a mid-stream reply finishes on a deploy SIGTERM. Deferred at family scale: `@grammyjs/runner`, sessions, conversations (grammY's own docs cap `bot.start()` at ~5k msg/hr — far above us; the sequential loop also stops one user's rapid messages spawning concurrent agent runs).

- _Fallback:_ any rich-method error flips `streamRichReply` to a single plain `ctx.reply` of the final text — the family always gets an answer even on a client/API that doesn't speak 10.1 yet. Rich Messages are private-chat only (fine — family bot).
- **Voice transcription via Groq Whisper, direct.** Telegram voice messages arrive as OGG/OPUS. Groq's Whisper API accepts OGG natively — no ffmpeg conversion. 20 MB Telegram download limit = ~15-20 min audio, plenty.

## Considered alternatives (and why not)

|                                   | Verdict                   | Why                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **gramio**                        | Original pick, superseded | TypeScript-first, tracks the Bot API fastest (10.0 support shipped same-day vs grammY's weeks-later PR). Lost on maturity: pre-1.0 with breaking changes at minor bumps, and a far smaller plugin ecosystem. The same-day-API-support advantage doesn't matter for a family bot; stability does. Easy to revisit if grammY ever stalls. |
| **telegraf**                      | Skip                      | TS rewrite produced types "too complex to understand." Last release ~2 years ago, lags Bot API.                                                                                                                                                                                                                                         |
| **node-telegram-bot-api**         | Hard skip                 | JS-first, no real types, internal deprecation warnings, no middleware model. Past 50 lines you fight it.                                                                                                                                                                                                                                |
| **Webhooks via Tailscale Funnel** | Skip for the bot          | Adds infra surface for zero gain at family scale. Reserve Funnel for Mini Apps hosting (see Future).                                                                                                                                                                                                                                    |

## Multi-box / gift-box model (June 2026)

If chota boxes are ever built for other families (see `next.md` §The box), the Telegram story scales with **zero shared infrastructure**: each box gets its own bot from BotFather, its own `TELEGRAM_BOT_TOKEN` in that box's `.env`, and its own family's chat IDs in its `chota.config.ts`. Long polling means no public URL, no tunnel, no per-box cloud component — the box only dials out.

Explicitly considered and rejected: a Cloudflare Worker per box receiving webhooks. The Worker still has to deliver updates to the box, which means either the box polls the Worker (then poll Telegram directly and delete the Worker) or a cloudflared tunnel into the box (a daemon + account binding + outage surface per box). That pattern earns its keep at hundreds of bots with central filtering; not here.

Support access to a gifted box is a separate concern from Telegram entirely — the answer is Tailscale (box joins a shared tailnet; SSH over that), same as our own deploy path.

## Telegram features that matter for chota

| Feature                                    | Bot API                                    | Use                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rich Messages — `sendRichMessageDraft`** | **10.1 (Jun 2026)**                        | **The streaming-reply primitive.** Stream a structured AI answer (headings, lists, tables, code, collapsible `RichBlockDetails`/`RichBlockThinking`) live as the model generates. Supersedes `sendMessageDraft` for our use. Private chats only — fine, family bot. |
| **`sendMessageDraft` streaming**           | 9.5 (Mar 2026); empty-text allowed in 10.0 | The plain-text predecessor to Rich Messages. Still a valid simpler fallback for a first cut.                                                                                                                                                                        |
| **Forum / message threads**                | stable + private chat threads in 9.3       | Optional later: per-kid topic, per-concern topic ("weather", "school"). Defer until conversation volume warrants.                                                                                                                                                   |
| **Voice messages**                         | longstanding                               | Voice → Whisper → agent. The main Phase 3 input mode.                                                                                                                                                                                                               |
| **Mini Apps** (HTML5 webapps in chat)      | 8.0 (Nov 2024) — full-screen + sensors     | Future kid mini-apps surface. See §Future.                                                                                                                                                                                                                          |

## Voice → agent pipeline (sketch)

```
1. user sends voice note            → bot.on('message:voice')
2. ctx.getFile() → file_path        (URL valid for limited time, download immediately)
3. fetch OGG bytes                  (no format conversion needed)
4. POST to Groq Whisper             (multipart, model=whisper-large-v3)
5. transcript → runAgent(...)       (existing Vercel AI SDK loop, same tools)
6. streamReply(ctx, textStream)     (our small helper around sendMessageDraft + throttled edits)
```

## Minimum viable sketch

Not for use as-is — just to anchor the shape when implementation lands.

Reflects the agent that exists _today_ (`chotaAgent` — a `ToolLoopAgent` — and the `runAgent()` event wrapper in `src/lib/server/agent/index.ts`). `transcribeVoice` is Phase-3 and not built yet.

```ts
import { Bot } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { chotaAgent, runAgent } from '$lib/server/agent';
import { getConfig } from '$lib/server/config';
import { env } from '$env/dynamic/private';

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
bot.api.config.use(autoRetry());

// Whitelist — drop updates from anyone not in chota.config
const allowed = new Set(getConfig().telegram?.allowedChatIds ?? []);
bot.use(async (ctx, next) => {
	if (!ctx.chat || !allowed.has(ctx.chat.id)) return; // silent drop
	await next();
});

bot.command('start', (ctx) => ctx.reply("Hey, I'm Chota."));

bot.on('message:voice', async (ctx) => {
	const file = await ctx.getFile(); // download immediately — URL is short-lived
	const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
	const ogg = await fetch(url).then((r) => r.arrayBuffer());
	return handleText(ctx, await transcribeVoice(ogg)); // transcribeVoice: Phase 3, TODO
});

bot.on('message:text', (ctx) => handleText(ctx, ctx.message.text));

// SHIPPED shape — streaming. runAgentStream() wraps chotaAgent.stream() and
// emits the agent.run wide event; streamRichReply() pushes the live draft and
// persists the final Rich Message. (See telegram/bot.ts + telegram/stream.ts.)
async function handleText(ctx, prompt: string) {
	await runAgentStream({ prompt }, (textStream) => streamRichReply(ctx, textStream));
}

bot.start(); // long polling — outbound getUpdates loop, NAT-friendly
```

`streamRichReply` (the real one in `telegram/stream.ts`) is the ~50-line helper the table below promised: a non-zero `draft_id`, accumulate the `textStream`, throttle `sendRichMessageDraft(chatId, draftId, { markdown })` to ~1.2s, then `sendRichMessage(chatId, { markdown })` once to persist (the draft is an ephemeral ~30s preview). Any rich-method error flips it to a single plain `ctx.reply` — the family always gets an answer. The agent emits Markdown and `InputRichMessage` takes a `markdown` string, so there's no hand-built `RichBlock` tree.

## Day-one requirements & gotchas (messaging mechanics)

- **Outbound alerts need no SDK and no polling.** `sendMessage` is one authenticated HTTPS POST (token + chat_id). A 5-line `notify()` helper in `tools/` covers "morning-print failed → parent's phone" and can ship long before the bot proper. This is the right first Telegram feature.
- **Bots can't DM first.** Each family member must press _Start_ on the bot once before it can message them — the consent handshake. Group alternative: add the bot to a family group (group chat IDs are negative); note BotFather's _privacy mode_ hides non-command group messages from the bot by default.
- **One poller per token.** Two processes calling `getUpdates` on the same token (dev machine + the box) → 409 conflicts and eaten messages. Gate `bot.start()` behind `KIOSK=true` like the print jobs, and use a separate throwaway dev token when developing handlers.
- **Capturing chat IDs for the whitelist:** log `ctx.chat.id` from incoming messages briefly, or have each person message @userinfobot; values go in `chota.config.ts > telegram.allowedChatIds`.
- **Runtime shape:** one file (`src/lib/server/telegram/bot.ts`), booted from `hooks.server.ts` like `bootJobs()`. Long polling is an async loop in the existing Node process — no second service, no port.

## Family group (shared chat with the bot)

Adding the bot to a family group works with the existing code — checklist:

1. Create the group, add the bot, send one message; grab the group's chat ID
   from the "not authorised" reply (it's negative, e.g. `-100123…`) and add it
   to `chota.config.ts > telegram.allowedChatIds`.
2. **Leave BotFather privacy mode ON** (the default). The bot then only sees
   `/commands`, @-mentions, and replies to its own messages — so it never
   burns tokens answering human-to-human chatter, and family small talk stays
   out of the agent. Ask it things as `@<botname> what's on the volleyball?`.
3. History is per-chat (`chat_message` keyed by chat ID), so the group gets
   its own shared conversation memory; in groups each stored user turn is
   prefixed with the sender's first name so the agent knows who asked.
4. `/print` works in the group — the brief PNG lands where everyone sees it.

Turning privacy mode OFF would deliver every group message to the bot; don't,
until there's a mention-gate in the handler (see the next section for the
idiomatic gate).

## grammY notes (1.45 / Bot API 10.2, researched July 2026)

Verified against grammy.dev + the release changelog. What matters for us:

**Applied:**

- `allowed_updates: ['message', 'callback_query']` on `bot.start()` — only
  fetch what we handle. `message_reaction` and `chat_member` are NOT in the
  default set; opt in explicitly if ever needed.
- 1.45 = Bot API 10.2 support + a `fetch duplex` fix that removes a class of
  Node upload errors on `replyWithPhoto(new InputFile(...))`. No breaking
  changes from 1.44.

**When the family group lands:**

- **Mention/reply gate** (needed only if privacy mode is ever turned off —
  with it ON, Telegram already filters to commands/mentions/replies). There is
  no built-in "mentions me" filter query (`message:entities:mention:me` does
  not exist); the idiomatic gate is:

  ```ts
  bot.on('message:text', async (ctx, next) => {
  	if (ctx.chat.type === 'private') return next(); // always answer DMs
  	const addressed =
  		ctx.entities('mention').some((e) => e.text === `@${ctx.me.username}`) ||
  		ctx.msg.reply_to_message?.from?.id === ctx.me.id;
  	if (addressed) return next(); // else drop silently
  });
  ```

- **Ephemeral replies (Bot API 10.2)** — messages visible only to one user in
  a group (`receiver_user_id` on send methods). The clean way to answer one
  person without spamming the whole family group. Evaluate when the group is
  live.
- **Reactions as status** — `ctx.react('🤔')` on receipt, `ctx.react('🫡')`
  when answered (a second react replaces the first). Works in groups without
  admin (only _receiving_ reaction updates needs admin + `allowed_updates`).
  Less noisy in a shared group than a streaming draft; keep the full
  thinking-draft for DMs.
- **Draft-ID collision** — `stream.ts` seeds `draft_id` from `Date.now()`;
  fine for one-at-a-time DMs, but two concurrent group runs could collide.
  Seed from `ctx.message.message_id` once groups are live.

**When voice lands:** `@grammyjs/files` (`hydrateFiles` transformer, installed
alongside `autoRetry`) → `bot.on('message:voice')` → `ctx.getFile()` →
`file.download()` (or `.getUrl()`, valid ≥1h — stream straight to Groq).
Voice notes arrive as Opus `.oga`; Groq accepts them directly.

**Deliberately skipped** (evaluated, not worth it at family scale):

- `@grammyjs/runner` — for >500 updates/sec bots; worse, it confirms update
  offsets before middleware finishes, which would break our `inFlight`
  SIGTERM drain and could lose a streaming reply on deploy.
- `conversations` (the agent loop owns turn-taking), `chat-members` (static
  allowlist), `ratelimiter` (family-only), and the 10.2 rich-message `blocks`
  tree (`markdown` string pass-through stays the right call).

## Anti-patterns

- **LLM moderation for inbound** — whitelist family chat IDs at the middleware layer. The Message Maddie incident is the cautionary tale. If grandparent web form ships later, gate that surface separately, not via the same agent loop.
- **Caching the `getFile` URL** — short-lived. Download bytes immediately, don't persist the URL.
- **OGG → MP3 conversion** — pre-2024 tutorials add ffmpeg. Skip; Groq accepts OGG directly.
- **Webhook without a request queue** — if you ever do use webhooks, NEVER do slow work (LLM, DB) synchronously in the handler. Telegram retransmits after ~10 s, causing duplicate agent runs. Polling sidesteps this entirely.
- **`node-telegram-bot-api` / Telegraf** — see table above.

## Future: Mini Apps + sandboxed kid-built games

When the agent loop + voice are stable, the Mini Apps surface opens up something specific to chota: a **sandboxed coding agent that builds small games on request**, exposed inside the bot. Kid says "build me a sudoku game in the bot" → coding agent (in a sandbox) writes a small HTML/JS app → bot serves it as a Mini App URL → Telegram wraps it.

### The Mini App contract

A Telegram Mini App is just an HTML page the bot tells Telegram to open. Telegram passes context (user identity, theme, viewport) into the page via `window.Telegram.WebApp` (vanilla) or via the official SDK [`@tma.js/sdk`](https://docs.telegram-mini-apps.com/packages/tma-js-sdk) (typed TS, the way to go for our stack).

What the SDK gives you:

- **`initData`** — signed payload with the user's Telegram identity (id, name, language) + a HMAC-SHA256 hash. **You verify the hash server-side** with your bot token to prove the request came from Telegram and isn't a forged URL hit.
- **Theme params** — Telegram's current colour scheme (light/dark + accent), so apps blend in
- **Viewport** — current height, expand/collapse state, safe-area insets (handy on mobile)
- **Main button + back button** — Telegram-native UI controls you can drive from JS
- **Haptic feedback, popups, share helpers** — small native-feeling extras

### Concrete shape for chota

- Coding agent (Claude Agent SDK or pi-coding-agent) runs in a Vercel-Sandbox-style isolate
- Output = static HTML/JS dropped into `data/mini-apps/<kid>/<slug>/index.html` (+ assets)
- The HTML imports `@tma.js/sdk` to read user identity, theme, viewport
- A SvelteKit route serves them at `/mini/<kid>/<slug>` with the right CSP for Mini Apps
- Server-side `verifyInitData(initData, botToken)` gates each request — the same handshake `@tma.js/sdk` uses on the client side
- Bot exposes a `/mini` command and inline-button menu of available apps via `web_app` buttons
- **Hosting** = **Tailscale Funnel** — the one place Funnel pays off, since Mini App URLs MUST be public HTTPS that Telegram can fetch

Would grow into a small arcade of kid-built things over time. **Defer until Phase 3 voice is stable + we have a real reason to want it.**

### When/if we build this — packages worth knowing

- **`@tma.js/sdk`** — the official-ish TS SDK. Replaces hand-rolling against `window.Telegram.WebApp`. Typed everything.
- **`@tma.js/init-data-node`** — server-side `validate(initData, botToken)` helper. Use in the SvelteKit route guard.
- **`@tma.js/sdk-svelte`** — Svelte bindings if we end up using SvelteKit pages as Mini Apps (vs. sandbox-built static HTML). For kid-built apps, plain HTML+JS is enough.

## What lands when (rough)

|                                                  | Lands when                                             | Why                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision: grammY                                 | Done — `grammy@^1.44.0` in package.json (Bot API 10.1) | Pre-made so Phase 3 doesn't re-litigate                                                                                                                                                                                               |
| Bot skeleton + whitelist + `/start` + text→agent | **Done — June 2026**                                   | Long polling, whitelist middleware, `runAgentStream()` per message. `src/lib/server/telegram/bot.ts`.                                                                                                                                 |
| Voice → Whisper → agent                          | Phase 3                                                | The killer Telegram feature for kids                                                                                                                                                                                                  |
| Streaming replies                                | **Done — June 2026**                                   | `streamRichReply()` in `telegram/stream.ts`: throttled `sendRichMessageDraft` previews → `sendRichMessage` to persist, plain-reply fallback. Driven by `runAgentStream()` (wraps `chotaAgent.stream()` + the `agent.run` wide event). |
| Forum topics for organising chats                | Phase 4+                                               | Only if conversation volume warrants                                                                                                                                                                                                  |
| Mini Apps + coding-agent arcade                  | Phase 4+                                               | Wait for Phase 3 to settle, then explore                                                                                                                                                                                              |

## Sources

- [grammY docs](https://grammy.dev) · [getting started (Node.js)](https://grammy.dev/guide/getting-started#getting-started-on-node-js) · [deployment types (long polling vs webhooks)](https://grammy.dev/guide/deployment-types) · [stream plugin](https://grammy.dev/plugins/stream) · [auto-retry](https://grammy.dev/plugins/auto-retry)
- [gramio docs](https://gramio.dev) (superseded original pick — revisit if grammY stalls)
- [Telegram Bot API changelog](https://core.telegram.org/bots/api-changelog) — [Bot API 10.1, 11 Jun 2026 (Rich Messages)](https://core.telegram.org/bots/api-changelog#june-11-2026)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) · [`@tma.js/sdk` docs](https://docs.telegram-mini-apps.com/packages/tma-js-sdk)
