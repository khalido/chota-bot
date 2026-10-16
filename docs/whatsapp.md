# WhatsApp — chota in the family's own chats

**Status: design, not built (2026-10-16).** The family uses WhatsApp, not Telegram. This puts chota in the family group and in 1-to-1 chats, alongside the existing Telegram bot ([`telegram.md`](telegram.md)), which stays as the fallback and the admin alert channel.

## The route: unofficial client, dedicated number

Meta has no official path for a personal or family bot. The WhatsApp Business Platform (Cloud API) is out on four counts:

- needs a Meta business portfolio, and groups need an Official Business Account (the badge most businesses don't have);
- groups are API-created and joined by invite link (max 8), so it can't join the family's existing group;
- the bot may only message inside 24 hours of the person's last message, otherwise paid, pre-approved templates — so no unprompted morning brief;
- since 15 Jan 2026 Meta bans "general-purpose AI chatbots" on the platform, which a family assistant likely is.

So chota links to WhatsApp the way WhatsApp Web does: as a **linked device** of a real account, via an unofficial client. That account is a normal one, so none of the above applies — it can join any group and message anyone, any time. It breaks WhatsApp's terms; the risk is a ban of that number, which is why it's a **dedicated number**, never a family member's own.

## Library: Baileys

|              | Baileys                                   | baileyrs                                                                     | whatsmeow-node                                           |
| ------------ | ----------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| What         | TypeScript implementation, in-process     | Baileys' API over whatsapp-rust compiled to WASM, in-process                 | TS bindings over whatsmeow (Go), a child-process binary  |
| Package      | `baileys` 7.0.0-rc14                      | `@oxidezap/baileyrs` 0.3.11, MIT, Node ≥22.3, targets Baileys rc14           | `@whatsmeow-node/whatsmeow-node` 0.8.0, MIT, linux-arm64 |
| Use (npm/wk) | ~406k                                     | ~1.6k (started Apr 2026)                                                     | ~500                                                     |
| Engine       | JS; v7 still release-candidate            | whatsapp-rust: 907★, v0.7.0, commits daily                                   | whatsmeow: very active, behind mautrix-whatsapp          |
| Extras       | proven by OpenClaw (`@openclaw/whatsapp`) | Rust-side reconnect with backoff, media CDN failover, fuzzed against Baileys | ~10–20 MB extra process                                  |

**Start on Baileys, write against its API, keep baileyrs in play.** Baileys is the most used by far and OpenClaw is a working reference to copy. baileyrs mirrors Baileys' API (its CI checks consumer code against it), so switching is mostly an import change, and it brings things we'd otherwise write: transient reconnects with backoff inside the engine, media CDN failover, a well-kept Rust core. It's young (0.3.x, six months) — so is chota. The spike runs both against the same code and we keep whichever behaves better on the Pi. whatsmeow-node is the fallback if both disappoint.

**Our own connector, not OpenClaw's plugin.** `@openclaw/whatsapp` needs OpenClaw's runtime and is built for every setup (multi-account, pairing approvals, proxies). chota's is small and opinionated: one account, a config allowlist, mention-gated groups, the agent behind it. OpenClaw's code and docs are the checklist of what goes wrong.

All three link by **QR or an 8-character pairing code** (WhatsApp → Linked devices → "Link with phone number instead"). The pairing code is what makes remote setup easy: chota shows the code, the phone's owner types it in.

## Lessons from OpenClaw's plugin

Read from the published `@openclaw/whatsapp` 2026.10.3 (built JS; Baileys calls in `socket-close`, `monitor`, `send`):

- **Socket:** `useMultiFileAuthState(dir)` + `makeCacheableSignalKeyStore`, `fetchLatestBaileysVersion()`, `syncFullHistory: false`, `markOnlineOnConnect: false` (so the phone still gets notifications), `keepAliveIntervalMs: 25_000`.
- **Auth files are the account.** They write `creds.json` atomically, keep a `.bak` and restore from it, and serialise saves through a queue. A corrupted creds file means re-linking. Back the auth dir up.
- **`getMessage`** from a small cache of recently sent messages (Baileys needs it to resend on decryption retries) and **`cachedGroupMetadata`** (saves a group-metadata query per group message; refresh it on `groups.update`). Use the house `lru-cache` (handover step 2, not yet a dependency), not `node-cache`.
- **Reconnect** with backoff on close; on `loggedOut` stop and alert instead of looping. A watchdog reconnects only when transport frames stop, not when chats are merely quiet.
- **Groups:** reply only when mentioned — a native @mention, a name pattern ("chota"), or a reply to the bot. A reply to the bot satisfies the mention but not the sender allowlist.
- **Sending:** `composing` presence while the agent works; split at ~4000 chars on paragraph breaks; Markdown converted to WhatsApp's `*bold*`/`_italic_`. chota's replies are short (`STYLE` in `prompts.ts`), so ours is a few lines, not a module. No streaming by edit — they send finished chunks.
- **After the first QR scan WhatsApp closes the socket with `restartRequired` (515)** to swap in permanent keys; reconnect on every close except `loggedOut` (401).
- **Version:** OpenClaw calls `fetchLatestBaileysVersion()`, which reads the version from Baileys' own master branch and falls back to the bundled one. Use that, never `fetchLatestWaWebVersion()` (scrapes WhatsApp Web; can outrun the library's protobufs). The master-branch fetch is brittle (it parses line 7 of a source file and falls back silently), so log the version in use. Baileys 7 is a release candidate: pin it exactly (`7.0.0-rc14`), since a `^` range doesn't move between rcs — the exception to the no-pinning rule.
- **Ignore what we don't use:** `shouldIgnoreJid` for `@newsletter` and status broadcasts.
- **QR linking from a headless host:** terminal QRs can expire in transit; show it somewhere the phone can scan quickly.

## Number and registration

The spare amaysim number (pay-as-you-go), as a **second eSIM on KO's Pixel**, registered in the **WhatsApp Business app** — which runs beside personal WhatsApp with its own number, so KO's own WhatsApp is untouched.

**Status (2026-10-16):** KO switched a spare number to amaysim [As You Go](https://www.amaysim.com.au/sim-plans/28-day-sim-plans/as-you-go) (pay as you go, 12c/SMS) and requested an eSIM (2–3 hours to process). Active on KO's Pixel the same day.

1. Move the spare number to eSIM (amaysim: QR + activation code; may need support to reissue a PAYG number as eSIM). Pixel 10 runs two eSIMs at once.
2. Install WhatsApp Business, register the spare number (SMS code arrives on the same phone). Profile name "Chota", a photo.
3. Turn on **two-step verification** (a PIN) in WhatsApp Business, so nobody can re-register the number with an intercepted SMS.
4. Link chota: WhatsApp Business → Linked devices → scan the QR, or enter the pairing code chota shows.
5. Add the bot number to the family group; family members save it as a contact.

Why not the alternatives:

- **Pixel Tablet as the primary device:** Android-tablet primary mode is still in limited beta (WABetaInfo, July 2026); on stable WhatsApp a tablet can only be a linked device. Reading the code on the phone and typing it in the tablet would work once that ships — the registration code is just 6 digits (the linking pairing code is a different, 8-character one).
- **A spare phone:** works, but one more device to keep charged and updated, for nothing the Pixel doesn't do.
- **Linking KO's own number:** the bot would post as KO, and a ban would take KO's account.

**Keep-alive rules:** the WhatsApp app on the primary phone must connect at least every 14 days or WhatsApp logs out linked devices. It needs internet, not the SIM, and no messages need sending; a daily phone does it for free. On the Pixel, turn **battery optimisation off for WhatsApp Business** — KO uses personal WhatsApp day to day, so Android could freeze the Business app untouched in the background. Leave the eSIM on anyway (SMS-only, no cost) so a re-verification SMS can land. Up to 4 linked devices. A Business account shows contacts a "business account" label; harmless here.

**Cost:** amaysim PAYG credit lasts 365 days and a recharge extends it, so roughly one small recharge a year; receiving SMS is normally free in AU (not confirmed for amaysim). Use a real mobile number — WhatsApp often rejects VoIP numbers.

## How it fits chota

- `src/lib/server/whatsapp/`, the same shape as `telegram/`: boot from `hooks.server.ts`, run the same agent. **Printing needs a route:** in Telegram it's the `/print` command and inline buttons outside the agent (`telegram/bot.ts`), and `chotaAgent` has no print tool. WhatsApp has no buttons, so add a `print` tool to the agent (gated on an allowlisted sender, with approval for the laser) — which Telegram then gets too.
- **Allowlist by person, not raw JID.** Baileys 7 addresses people by LID (`<n>@lid`, a hidden ID) as well as phone JID; groups mostly use LIDs. Resolve each sender to a phone number: `key.remoteJidAlt` / `key.participantAlt` first, then `sock.signalRepository.lidMapping.getPNForLID()` (OpenClaw does the same). **Fail closed** on a sender that won't resolve, and log it so the LID can be added to config.
- **Config** in `chota.config.ts`, beside `telegram`: `whatsapp: { people: [{ name, phone, lid? }], groups: [jid], mentionName: 'chota' }`. Config holds the numbers; code and docs never do.
- **Groups:** an @mention of the bot or a reply to it always gets an answer — deterministic. For everything else, a cheap Jev judgment ("is this addressed to chota, or something it should act on?", [`agent.md`](agent.md) §Decisions) decides; below the threshold, stay silent. 1-to-1: respond to everything from an allowlisted number.
- **React, don't reply, when a reaction says it all.** "Add milk" → the item is added and the message gets ✅; a reminder noted → 👍. A WhatsApp/Telegram reaction on the person's message instead of a new message keeps the group quiet. yaad maps each tool to an emoji (`~/code/yaad/yaad/agent/hooks.py`, `TOOL_EMOJIS`; Telegram's allowed set in `webhooks/telegram.py`) — copy that.
- **Commands and printing** come from the shared registry and the agent's `print` tool ([`agent.md`](agent.md) §Channels, commands and actions) — nothing WhatsApp-specific beyond parsing a leading `/` and showing choices as a numbered list.
- **Replies:** typing indicator while the agent runs, then the finished answer (chunked). No streaming, so `runAgent` rather than Telegram's streamed reply. Printouts go as **documents**, so WhatsApp doesn't recompress the PNG.
- **Shared with Telegram:** the agent runner, history (`loadHistory`/`appendMessage`, keyed per chat, with the `sender:` prefix from `telegram/bot.ts`), print composition, the in-flight drain on shutdown. Copy the ~25-line message flow first; extract a shared `channels/` handler when the third channel (Syntech) arrives.
- **Auth state** in `data/whatsapp/`. Not in the nightly backup: restoring stale Signal session keys over a live link can break decryption (plausible, unverified), and losing it only means re-linking.
- **Health:** session state in `/api/health`; a Telegram alert when the session drops or is logged out.
- **Telegram stays** — the admin channel, and the fallback if the WhatsApp number is ever banned.

## Failure modes to build in

- **Offline replay.** WhatsApp delivers messages queued while chota was down; Telegram's `drop_pending_updates` has no equivalent. Handle only `notify` upserts, drop messages older than the connection (or ~2 minutes), and dedupe by `key.id` in an `lru-cache` — otherwise a reboot re-runs this morning's "print Kid1's brief".
- **Echo loops.** Ignore `key.fromMe` (the bot's own sends come back as upserts) and never answer another bot.
- **Prompt injection from the group.** Anyone added to the group can type at chota. The sender allowlist applies to every message the model sees, not just the trigger; tools with side effects (print, calendar writes) run only for an allowlisted sender.
- **Disconnect reasons** (`DisconnectReason` in Baileys 7): reconnect with backoff on 408/428/503 and 515 (`restartRequired`, normal after first link); **stop and alert** on 401 `loggedOut`, 403 `forbidden`, 411 `multideviceMismatch`, 500 `badSession`, and 440 `connectionReplaced`.
- **One process per account.** 440 is what you get when a dev run on the Mac uses the Pi's creds — the Telegram "one poller per token" rule again. Dev uses its own auth dir and a test number, or stays off.
- **Re-linking.** On 401: stop, mark health "needs link", Telegram alert ("logged out — phone offline 14+ days, unlinked, or banned"), and re-pair from an `/admin/whatsapp` page that shows the QR or pairing code. Never auto-delete the auth dir.
- **One turn at a time per chat.** Baileys doesn't await `messages.upsert` handlers, so two quick group messages would run two agent turns interleaving history on the same chat (grammY's polling serialises this for Telegram). Queue turns per chat; add `stopWhatsapp()` to the shutdown drain.
- **Send rate.** Serialise sends per chat with a small gap, and hard-cap sends per hour to catch an agent loop.
- **Privacy.** Group messages addressed to chota go to the model through AI Gateway, as Telegram's do; that content leaves the house.

## The morning message to the family group

The first unprompted send worth building: one short message to the family group on school mornings, the chat twin of the printed brief. "Today: Kid1 volleyball 4pm, Kid2 library day, bin night. Rain from 3pm — raincoats." Same data as the print (calendar, weather, school, chores); one line per thing that changes what someone does today, and nothing on a day with nothing to say. Rain only when it matters for the school run. Sent at a fixed time just after the print, from a `defineJob`, through the WhatsApp adapter (Telegram until then). Details in [`agent.md`](agent.md) once the review of brief ideas lands.

Unprompted sends (a morning brief to a person's chat) are possible on this route; keep them few and only to the allowlist — volume and unsolicited messages are what trip WhatsApp's spam heuristics.

## Voice

- **Voice notes in:** download the audio, transcribe (Groq, as planned for Telegram), run the agent on the text. Only in DMs and replies to the bot — OpenClaw also transcribes every group voice note to look for its name, which means sending all of the family's voice notes to a model.
- **Voice notes out (later):** `google/gemini-3.8-flash-tts` through the Gateway, converted to Ogg/Opus and sent as a push-to-talk note (OpenClaw transcodes with `ffmpeg`). Uses: a news roundup, a short story, anything better heard than read. Same for Telegram.
- **Live calls (later, separate):** WhatsApp calls through these libraries are experimental — whatsapp-rust has a [VoIP calls guide](https://whatsapp-rust.jlucaso.com/guides/voip-calls.md), OpenClaw's MeowCaller is off by default. The steadier route to "ring chota and talk" is a normal phone number on [Twilio Voice](https://www.twilio.com/en-us/voice/fact-sheet) streaming audio to a realtime voice model (`google/gemini-3.8-live` on the Gateway). Its own design when we get there.

## Reuse in other deployments

The module takes its account from config (auth dir, allowlist, groups, mention name), not chota specifics, so another deployment can run it. First other user: **Syntech's internal staff bot**. Internal use means the same unofficial route fits; the official Cloud API would only matter for a customer-facing bot.

Setup for a business number: a cheap Android phone on Wi-Fi and a charger, WhatsApp Business installed and registered _on that phone_ by its owner (they type the SMS code themselves — no one needs to read it out), two-step PIN on, the app opened weekly so Android doesn't sleep it past the 14-day rule. Link remotely with the pairing code.

## Resources

- OpenClaw WhatsApp channel — [docs](https://docs.openclaw.ai/channels/whatsapp), npm `@openclaw/whatsapp` (read the built JS).
- [Baileys](https://github.com/WhiskeySockets/Baileys) — the library.
- [baileyrs](https://github.com/oxidezap/baileyrs) over [whatsapp-rust](https://github.com/oxidezap/whatsapp-rust) ([docs for agents](https://whatsapp-rust.jlucaso.com/llms.txt)).
- [whatsmeow-node](https://nicastelo.github.io/whatsmeow-node/docs/intro) over [whatsmeow](https://github.com/tulir/whatsmeow).
- [baileys-antiban](https://github.com/kobie3717/baileys-antiban) — ideas, not a dependency: WhatsApp's group-op limits (~3 adds / 2 creates per 10 min), disconnect classification, warm-up of a new number, session health. Its human-mimicry (fake typos, presence cycling) is for bulk senders, not a family bot.
- **Supply chain:** the WhatsApp npm ecosystem has had credential-stealing packages (`lotusbail`, April 2026). Keep WhatsApp dependencies to the library itself and read anything else before installing.

## Open questions

- Which chats does the bot speak in unprompted, if any?
- Kids 1-to-1 with the bot, or only in the family group?
- Should the agent see group messages that don't mention it? **Default: addressed-only.** If context is wanted later, keep them locally and pass them labelled as untrusted.

## Build order

1. Before the WhatsApp module: the Pi is the server (link once, on the box that keeps it) and the `lru-cache` helper exists.
2. Number: eSIM + WhatsApp Business registered, two-step PIN on, battery optimisation off (KO).
3. **Warm up the number** for a few days before automating it: normal messages with the family from the phone, joined to the family group, a profile name and photo. A brand-new number that starts sending automated messages straight away is the classic ban pattern.
4. Spike in `scripts/`, on the Pi, behind a 4-method interface (`send`, `onMessage`, `onConnection`, `requestPairingCode`). It must prove:
   - link headless by pairing code and by QR, including the 515 restart; restart with saved creds and no re-link;
   - **every family member resolves to a person**, in a DM and in the group (LID vs phone) — the biggest unknown;
   - an @mention of the bot is detectable (`contextInfo.mentionedJid` is a LID in v7; match the bot's own PN and LID from `sock.user`);
   - killing the process for 5 minutes replays nothing old;
   - a PNG goes out as a document.

   Run it on Baileys, then swap the import to baileyrs and rerun; keep whichever is steadier.

5. `whatsapp/` module: allowlist, mention gating, per-chat turn queue, agent replies + a `print` tool, typing presence, reconnect, `/api/health`.
6. Media out (print PNGs, artifacts), then voice notes in (Groq transcription, as planned for Telegram).
