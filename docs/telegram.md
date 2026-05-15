# Telegram bot

**Status: planned, Phase 3.** Lands after the agent loop + voice transcription are stable. Document captures the decisions so when we build it the choices are pre-made.

## Decisions

- **Wrapper: [gramio](https://gramio.dev)** (`gramio` on npm). TypeScript-first with type propagation through the entire chain (no manual annotations), built-in formatting (no manual `parse_mode`), companion packages for retry / sessions / scenes / i18n / test, runs on Node + Bun + Deno. **Tracks the Bot API closely** — gramio v0.10.0 shipped same-day as Telegram's Bot API 10.0 release (2026-05-08). Pre-1.0 = breaking changes possible at minor bumps; that's an accepted risk for a Phase 3 project that hasn't started.
- **Long polling, not webhooks.** Box is behind home NAT — webhooks need a public HTTPS endpoint Telegram can POST to (port 443/80/88/8443 only). Polling is outbound TCP, works through NAT for free. Family-scale traffic doesn't need the throughput webhook offers. (Tailscale Funnel could expose a webhook URL, considered and explicitly ruled out — adds infra surface for zero gain at our scale. We reserve Funnel for hosting Mini Apps later, which genuinely needs public HTTPS.)
- **Whitelist by chat ID.** Family members' Telegram user/chat IDs in `chota.config.ts > telegram.allowedChatIds`. First-message-from-anyone-else is silently dropped. No "LLM moderation" for inbound — see §Anti-patterns.
- **Streaming via `sendMessageDraft` (Bot API 9.5).** Telegram natively supports live-edited messages as the LLM streams in. gramio doesn't have a stream-plugin equivalent of `@grammy/stream` (yet) — we'll write a small ~50-line throttled-edit helper around `bot.api.sendMessageDraft(...)` that consumes Vercel AI SDK's `textStream`. Pair with `@gramio/auto-retry` for rate-limit resilience.
- **Voice transcription via Groq Whisper, direct.** Telegram voice messages arrive as OGG/OPUS. Groq's Whisper API accepts OGG natively — no ffmpeg conversion. 20 MB Telegram download limit = ~15-20 min audio, plenty.

## Considered alternatives (and why not)

| | Verdict | Why |
|---|---|---|
| **grammy** (~1.26M weekly downloads) | Strong runner-up | The de-facto standard for several years. 1.x mature, larger plugin ecosystem (incl. `@grammy/stream` we'd write ourselves on gramio). Loses on Bot API responsiveness — Bot API 10.0 support was still in PR review (#904, #905) two weeks after Telegram's release, while gramio shipped same-day. If gramio's pre-1.0 churn becomes a problem, this is the easy fallback. |
| **telegraf** | Skip | TS rewrite produced types "too complex to understand." Last release ~2 years ago, lags Bot API. |
| **node-telegram-bot-api** | Hard skip | JS-first, no real types, internal deprecation warnings, no middleware model. Past 50 lines you fight it. |
| **Webhooks via Tailscale Funnel** | Skip for the bot | Adds infra surface for zero gain at family scale. Reserve Funnel for Mini Apps hosting (see Future). |

## Telegram features that matter for chota

| Feature | Bot API | Use |
|---|---|---|
| **`sendMessageDraft` streaming** | 9.5 (Mar 2026) | Live "agent typing" UX during LLM streaming. Private chats only — fine, family bot. |
| **Forum / message threads** | stable + private chat threads in 9.3 | Optional later: per-kid topic, per-concern topic ("weather", "school"). Defer until conversation volume warrants. |
| **Voice messages** | longstanding | Voice → Whisper → agent. The main Phase 3 input mode. |
| **Mini Apps** (HTML5 webapps in chat) | 8.0 (Nov 2024) — full-screen + sensors | Future kid mini-apps surface. See §Future. |

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

```ts
import { Bot } from 'gramio';
import { autoRetry } from '@gramio/auto-retry';
import { runAgent } from '$lib/server/agent';   // when this exists
import { transcribeVoice } from '$lib/server/tools/transcribe';
import { getConfig } from '$lib/server/config';

const bot = new Bot(env.TELEGRAM_BOT_TOKEN).extend(autoRetry());

// Whitelist — drop updates from anyone not in chota.config
const allowed = new Set(getConfig().telegram?.allowedChatIds ?? []);
bot.use(async (ctx, next) => {
  if (!ctx.chat || !allowed.has(ctx.chat.id)) return;  // silent drop
  await next();
});

bot.command('start', (ctx) => ctx.send("Hey, I'm Chota."));

bot.on('message', async (ctx) => {
  if (ctx.message.voice) {
    const file = await ctx.bot.api.getFile({ file_id: ctx.message.voice.file_id });
    const url = `https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
    const ogg = await fetch(url).then((r) => r.arrayBuffer());
    const text = await transcribeVoice(ogg);
    return handleText(ctx, text);
  }
  if (ctx.message.text) return handleText(ctx, ctx.message.text);
});

async function handleText(ctx, text: string) {
  const { textStream } = await runAgent({ prompt: text, stream: true });
  await streamReply(ctx, textStream);   // ~50-line helper around sendMessageDraft
}

bot.start();   // long polling
```

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

| | Lands when | Why |
|---|---|---|
| Decision: gramio | Now (this doc) | Pre-made so Phase 3 doesn't re-litigate |
| Bot skeleton + whitelist + `/start` | Phase 3, with voice | Same surface |
| Voice → Whisper → agent | Phase 3 | The killer Telegram feature for kids |
| Streaming replies | Phase 3 | ~50-line `streamReply()` helper around `sendMessageDraft` |
| Forum topics for organising chats | Phase 4+ | Only if conversation volume warrants |
| Mini Apps + coding-agent arcade | Phase 4+ | Wait for Phase 3 to settle, then explore |

## Sources

- [gramio docs](https://gramio.dev) · [comparison vs other frameworks](https://gramio.dev/comparison) · [plugins overview](https://gramio.dev/plugins/overview)
- [grammy docs](https://grammy.dev) (runner-up reference) · [stream plugin](https://grammy.dev/plugins/stream) (the pattern we'll mirror in our `streamReply()` helper)
- [Telegram Bot API changelog](https://core.telegram.org/bots/api-changelog)
- [Telegram Mini Apps](https://core.telegram.org/bots/webapps) · [`@tma.js/sdk` docs](https://docs.telegram-mini-apps.com/packages/tma-js-sdk)
