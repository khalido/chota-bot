# Google TV app

Design for a Play Store Google TV app: "send a dashboard to a screen". Issue: khalido/chota-bot#2. Not built. Mock: [`tv-app-mock.html`](tv-app-mock.html) (open it in a browser; arrow keys play Snake).

## In short

- **Capacitor around a third Vite entry in `cast/`** (`app.html`), beside `receiver.html`. One Svelte board, one protocol, two ways onto the TV.
- **Code lives in chota-bot `cast/`**, not a new repo. chota imports `cast/src/protocol` by relative path; a new repo means publishing the protocol as a package first. Move `cast/` out when someone other than chota needs the protocol.
- **Standalone** screens come from a built-in sender that turns free APIs into normal `screens` messages, the way `demo.ts` does now.
- **Linking** goes through a small relay on the Cloudflare account that already serves cast.khalido.dev. The TV and the bot both dial out to it, so it works behind any home router, for any bot. The TV asks for an OK before a bot takes over.
- **Play and learn:** ten games ranked by fun and cost, from Snake and generated mazes to a physics launcher, "guess the rule" graphs and logic puzzles. Old-school pixel look on a 2D canvas. Snake ships first, so the closed test starts early.
- **How things work** bundles about 12 machine figures from the Anatomy community gallery (MIT, no network, most run on their own), each in a sandboxed frame with its author on screen. About 3–4 days.
- **Slice 1 is a spike**: the smallest installable app, to settle six things nobody has confirmed on the Streamer (below).

## How it fits together

```
                ┌──────────── TV app (Capacitor, WebView) ────────────┐
 Open-Meteo ──▶ │ local sender ─┐                                     │
 cast.khalido ─▶│ (free screens)│                                     │
 .dev/daily.json│               ├─▶ core.ts ─▶ App.svelte (the board) │
                │ link transport┘   (join, limits,   + games          │
                │      ▲            revision)                         │
                └──────┼──────────────────────────────────────────────┘
                       │ WebSocket (TV dials out)
             link service: Worker + Durable Object per TV
                       │ WebSocket or POST (bot dials out)
                    chota / anyone's bot ── same split() and envelopes as Cast
```

`cast/src/receiver/transport.ts` already defines a `Transport` (start, reply, broadcast, close). The app adds two:

- `localTransport`: the standalone sender. It fetches the free sources and sends `theme` and `screens` like any sender. It is `demo.ts` with real data.
- `linkTransport`: a WebSocket to the link service. Envelopes are the Cast ones: `{ v: 1, id, type, revision, data }`, split with `split()`, joined by `core.ts`. Replies, pongs and `key` messages go back the same way.

When linked, the agent's screens replace the free ones. Games and the Link screen stay; they belong to the app, not to a sender.

## Wrapper: Capacitor

**Pick: Capacitor. The spike starts on 8.6.2 (released 12 Nov 2026) and moves to 9 when 9.0.0 ships.** 9.0.0-rc.0 came out on 12 Nov with no final date announced, and `@capacitor/app`, which carries the Back handler, is only at 9.0.0-alpha.2. The rc's Android changes are small (Gradle 9 and AGP 9 publishing, live reload on Android 17), so nothing the spike learns on 8 changes on 9. `npx cap migrate` does the move. Both templates use minSdk 26 and targetSdk 37; Play needs minSdk 31 or lower and target API 34 or higher for TV, so either fits.

|                           | Capacitor                                                                                                             | Hand-written WebView activity                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Native code we write      | Manifest lines, banner, maybe a key-forwarding override in `MainActivity`                                             | About 100 lines of Kotlin: WebView setup, `WebViewAssetLoader`, Back, keys, keep-awake, a JS bridge |
| Gradle, AGP, SDK upgrades | `cap migrate` and Ionic's template                                                                                    | By hand, every year when Play raises the target API                                                 |
| Back key                  | `@capacitor/app` `backButton` event, read from its source                                                             | `OnBackPressedCallback` we write                                                                    |
| Dev loop                  | `cap run android -l`: live reload on the TV                                                                           | Rebuild the APK                                                                                     |
| Voice, keep-awake         | Plugins (`@capacitor-community/speech-recognition` 7.0.1, keep-awake)                                                 | Write them                                                                                          |
| Risk                      | Ionic says it won't support Android TV. That matters little: the TV bits are manifest entries, not Capacitor features | All upkeep is ours                                                                                  |

Other wrappers, ruled out: a trusted web activity needs Chrome, which Google TV doesn't have; React Native for TV means rewriting the board; Tauri mobile has no TV reports.

**Versions:** `@capacitor/core`, `cli`, `android` and `app` on a `^8` range (then `^9`), all on the same major, with `bun.lock` committed. Bump them together, the way `auth` and `better-auth` are bumped together in chota.

**Focus:** a WebView has no D-pad focus of its own that's worth relying on. The receiver already moves a focus ring with the arrows (`keys.ts`, `App.svelte`). The app extends that to the Games and Link screens, without a spatial-navigation library.

The Kotlin left under Capacitor is the same Kotlin a hand-written app needs for its TV bits. What Capacitor removes is the yearly Gradle and target-API upkeep. If the spike shows Capacitor fighting the D-pad, switch: the web build has no Capacitor imports except one `platform.ts` (Back, exit, voice).

TV-specific Android setup, added by hand (Capacitor's template has none):

- `CATEGORY_LEANBACK_LAUNCHER` on the main activity.
- `android.software.leanback` `required="true"` (TV only; no phone listing to maintain).
- `android.hardware.touchscreen` `required="false"`.
- A 320×180 banner in `drawable-xhdpi` with the app name in it, and an icon of at least 160×160.
- Landscape only. Keep the screen on while the app is open (`FLAG_KEEP_SCREEN_ON`).

## Remote keys

| Key           | How it reaches the page                                                                                         | Confirmed?                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| D-pad, OK     | DOM `keydown`: `ArrowUp` … and `Enter` (Chromium's mapping of DPAD_* and DPAD_CENTER)                           | No. Old reports of arrows not reaching some WebViews |
| Back          | Not a keydown. Capacitor's App plugin takes it on Android's back dispatcher and fires `backButton`              | From Capacitor's source only, not on a TV            |
| Play/Pause    | Maybe `MediaPlayPause` keydown. Android routes media keys to a `MediaSession` when one exists                   | No                                                   |
| Held D-pad    | Repeated `keydown`, or `keydown` then `keyup`?                                                                  | No                                                   |
| Mic           | `SpeechRecognizer` with `RECORD_AUDIO` is the likely route; `RecognizerIntent` may have no handler on Google TV | No                                                   |
| Accelerometer | Not passed to apps (KO checked, 19 Nov)                                                                         | Yes                                                  |

Fallback for any key the WebView doesn't get: override `dispatchKeyEvent` in `MainActivity` and pass the key to the page as a JS event. About 15 lines.

**Back.** Play's TV rule: Back must end at the TV home screen, and never toggles. A `backButton` listener turns off Capacitor's default, so the app does it all:

- In a game: Back leaves the game for the Games screen.
- On an open card: Back closes it.
- On any screen but the first: Back goes to the first screen.
- On the first screen: Back calls `App.exitApp()`.

The Cast receiver keeps its own rule (Back closes) in `keys.ts`; the app gets its own small key map in the same style.

## Standalone mode

All checked 19 Nov from a web page (CORS works for all of them).

| Screen      | Source                                                                                      | Key                        | Notes                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Clock, fact | Bundled in the app                                                                          | None                       | A few hundred facts, kid-safe, reviewed once                                                                                                                                                                                                                                           |
| Weather     | Open-Meteo forecast + geocoding, from the TV                                                | None                       | Free for non-commercial use: no ads, no subscription, no in-app purchase. 10,000 calls a day per IP. Attribution required ("Weather data by Open-Meteo.com"). wttr.in also works, but has no stated limits or uptime: keep it out                                                      |
| Space       | NASA APOD, fetched once a day by a scheduled Worker on cast.khalido.dev                     | KO's free key, server-side | `DEMO_KEY` allows about 10 calls per IP. APOD returned a 500 today with quota left, so NASA's side fails too: keep yesterday's file when a fetch fails. A key in the app is shared and extractable. Video days: show the thumbnail or yesterday's picture. Always show the credit line |
| On this day | Wikipedia's feed (`en.wikipedia.org/api/rest_v1/feed/onthisday/…`), via the same daily file | None                       | The Worker sends a descriptive `User-Agent`, as Wikimedia's policy asks. Today's first "selected" event is a suicide bombing. See the content decision below                                                                                                                           |

**Location** comes from the TV's time zone: `Australia/Sydney` gives "Sydney", which Open-Meteo's geocoder turns into coordinates. No permission, no IP lookup. The Weather screen has a "Change city" row with a text field. Android TV's on-screen keyboard should open for it (the spike checks). When linked, the agent's theme sets the place.

**`/daily.json`** on cast.khalido.dev (a scheduled Worker, separate from the link service): APOD and a filtered On this day, built once a day, cached at Cloudflare's edge. One fetch per TV per day. If it fails, those two screens show yesterday's copy from the TV's storage.

The last good screens (free or linked) are kept in the TV's storage, so the board draws at once on open.

## Linking to an agent

**Pick: a relay ("link service")**, not a LAN pull.

- A Telegram message can't tell the TV where the bot is, and a WebView can't accept connections. Both sides must dial out to a place they both know.
- A LAN pull needs the TV to learn the bot's address, and fetching `http://` from the app's `https://localhost` origin is mixed content. Tailscale isn't on most people's TVs.
- The relay is a Worker plus one Durable Object per TV, in the same Worker that serves cast.khalido.dev. Durable Objects (SQLite) are on Cloudflare's free plan, and with the hibernation API an idle socket costs no duration.
- The free plan allows 100,000 Durable Object requests a day, and incoming WebSocket messages count. chota sending once a minute is about 1,500 a day per TV, so the free plan carries about 50 such TVs. Each TV gets a cap of 3,000 messages a day; past it, the service refuses with an error the bot can read. More TVs than that means Workers Paid (US$5 a month).

**Pairing:**

1. On first open, the TV makes a random id and secret (32 bytes) and keeps them in its storage.
2. The Link screen asks the service for a code: 6 digits, valid 10 minutes, one use. The TV shows the code and a QR code to `cast.khalido.dev/link`, a page with the steps.
3. You tell your bot "link the TV 482913". The bot posts the code and its name to the service.
4. The TV asks "Link to <bot name>?". Nothing arrives until someone presses OK on the TV. Then the service gives the bot an agent token for that TV, and the bot's screens arrive.

**Tokens and abuse:**

- The service stores the TV id, a hash of each token, the bot's name and the link date. Nothing else.
- Code guessing: with many TVs showing codes, a random guess could hit a stranger's TV. The confirm on the TV stops that: a guessed code only puts a question on a screen someone has to accept. Claims are also limited to 10 a minute per IP.
- A TV has one linked agent. Linking a second replaces the first, and the TV says so.

**Push, not pull.** The TV holds a WebSocket to its Durable Object. The bot sends envelopes by POST, or holds its own socket if it wants keys back live. When the TV connects, the service tells the bot, and the bot resends its screens (the same "resend on an empty pong" rule as Cast).

**Unlinking:** tell the bot ("unlink the TV"), or press OK on "Unlink" on the Link screen. Either way the service deletes the link and closes both sockets.

**Privacy:**

- Screens pass through the service to the TV and are not stored there. Payloads are TLS in transit and plain to the service while it forwards them.
- No accounts, no analytics, no ads.
- The privacy policy and Play's Data safety form say exactly this.
- End-to-end encryption (the TV's key in the QR code) is possible later. Not in v1.

**chota's side:** a third way to send in `src/lib/server/tv/`: `push()` over the link service as well as over Cast, with the same `buildScreens()`. The agent tool "link the TV <code>" stores the token like any other secret.

## Play and learn

The free app has to be fun on its own, or nobody recommends it and the 12 testers don't come. So games are the base app's main draw, and some of them teach.

**Look:** old-school and simple. Each game draws on a small canvas (480×270) scaled up 4× with `image-rendering: pixelated`: chunky sprites, a palette of about 16 colours, big type. It reads from the couch and costs the Streamer's GPU almost nothing. 2D canvas only; no Three.js.

**Remote limits:** D-pad, OK and Back for sure. Play/Pause and a long press on OK only if the spike shows `keyup` arrives. No pointer, no typing. Every game below works with arrows and OK alone.

Ranked by fun for kids against cost to build. Cost: S is a day or less, M is a few days, L is a week or more.

| #   | Game            | Plays like                                                                                                                                                                            | Teaches                     | Fun                                | Cost      |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------- | --------- |
| 1   | Snake           | Steer, eat, grow                                                                                                                                                                      |                             | High                               | S         |
| 2   | Maze            | A new maze every round (generated); reach the exit before the clock runs out                                                                                                          | Planning                    | High, little ones too              | S         |
| 3   | Launch          | Set angle and power with the D-pad, OK fires, hit the target. Gravity changes by level: Earth, Moon, Mars                                                                             | Projectile physics, by feel | High                               | M         |
| 4   | Breakout        | Port of the Pico's `app_pong.py`: paddle, bricks, 3 lives                                                                                                                             |                             | High                               | S         |
| 5   | Mines           | Generated grid, OK reveals, numbers say how many mines touch the square; first reveal always safe                                                                                     | Logic                       | Medium–high, 8+                    | S–M       |
| 6   | Guess the rule  | A graph draws itself; pick which of 4 rules made it (`y = 2x`, `y = x²`, a wave, a step). Coefficients are random, so rounds differ. Easy mode: "what comes next" in a number pattern | Functions and graphs        | Medium, 10+                        | S–M       |
| 7   | Maths sprint    | A sum, 4 answers, a streak counter and a clock. Generated by level: adding to times tables to fractions                                                                               | Arithmetic                  | Medium                             | S         |
| 8   | Reaction        | Port of `app_react.py`: OK when it turns green. Good with a room full of people                                                                                                       |                             | Medium, short                      | S         |
| 9   | Lights          | A 5×5 grid; OK flips a light and its neighbours; turn them all off. Levels are made by pressing random lights on a dark board, so every one is solvable                               | Logic                       | Medium                             | S         |
| 10  | How things work | Isometric machines that run themselves (an engine, a lock, a flush toilet, a watch). Left and right change machine; in most, OK works the main part (flush, click, spin up)           | How machines work           | Medium; a calm break between games | M (below) |

- **Slice 4 is Snake alone**, so the closed test starts early. Maze, Breakout and Reaction follow straight after, while the 14 days run.
- **How things work** has its own doc: [`how-things-work.md`](how-things-work.md).
- Generated levels need a seeded random function, so a good round can be replayed and a bug can be reproduced.
- Input is a held-key state from `keydown`/`keyup`, not key repeat. The spike checks that the Streamer sends `keyup`.
- Reaction's tiers (150, 250, 350, 500 ms) assume a wired button. A Bluetooth remote and a TV's display add latency, so measure it in the spike and shift the tiers.
- Best scores and levels reached stay on the TV.
- Later: a second player on a phone over the LAN.

## How things work

Machine figures from the Anatomy community gallery, played full screen and cycled with Left and Right: 12 unbranded MIT figures bundled in sandboxed frames, author credited on screen. About 3–4 days. Full design, findings and the figure list: [`how-things-work.md`](how-things-work.md).

## Play Store

| Item                      | What it takes                                                                                                                                                                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Developer account         | Personal (KO, 19 Nov). US$25 once, with ID checks. No D-U-N-S number, so the 12-tester closed test is the path; it starts at slice 4                                                                                                                                                                                     |
| Testing before production | A new personal account needs 12 testers opted into a closed test for 14 days in a row. Internal testing doesn't count. Opting in is what counts, but the production application asks how testers used the app, and the app installs only on a TV. Finding 12 people, ideally with a Google TV, is the real schedule item |
| TV review                 | Console: Setup → Advanced settings → Form factors → Android TV. Needs the banner, at least one TV screenshot and "Android TV" in the listing. Google doesn't state a review time; one 2024 report says about a month. Plan for weeks                                                                                     |
| Quality checklist         | Landscape, no text in the overscan edge (the board already keeps 5% margins), everything works with the D-pad, nothing needs a Menu key, Back ends at home                                                                                                                                                               |
| Format                    | App Bundle (AAB). The 64-bit and 16 KB page-size rules apply to native libraries; the app ships none unless a plugin adds one                                                                                                                                                                                            |
| Privacy policy            | Required even when no data is collected. One page on cast.khalido.dev                                                                                                                                                                                                                                                    |
| Data safety form          | Required. Standalone use collects nothing. Linking stores the TV's random id on the service, which Play counts as "Device or other IDs" collected (not shared, not sold). Screens pass through without being stored                                                                                                      |
| Others' content           | The machine figures are other people's MIT work: ship the licence notice (a credits screen) and name the author on every figure. No figures of branded products (Play's intellectual-property policy)                                                                                                                    |
| Wrapper rule              | Play rejects apps that are only a website in a WebView (not re-read for this doc). Bundled assets, offline screens and games are the defence                                                                                                                                                                             |

## Not confirmed: the spike settles these

1. D-pad and OK arrive as `keydown` (`ArrowUp`, `Enter`).
2. Back reaches Capacitor's `backButton` from the Streamer's remote.
3. Play/Pause arrives, and held keys send `keyup`.
4. The Streamer's WebView version, and whether Play updates it.
5. Frame rate of the board and a canvas game in the WebView (the Cast receiver holds 59–60 fps on the same box).
6. Frame rate of an animated SVG machine figure (700–2,400 elements) in a sandboxed iframe, whether the remote's keys reach a focused iframe, and whether `MainActivity` can send OK as Space. The spike bundles two simple figures, the flush toilet and the pop-up toaster, then tries the click pen (the heaviest of the first 12); see [`how-things-work.md`](how-things-work.md#first-test).

**Getting it onto the Streamer:** the handover says it has no adb open. Two ways:

- Turn on developer options (Settings → System → About → press the build number 7 times), then network debugging, then `adb connect`. Fastest; KO does it once on the TV. Menu names are from memory: check on the Streamer.
- Play internal testing (no review wait, doesn't count toward the 12 testers). Needs the developer account.

## Build plan

Each slice is one PR and works on its own. Games come before linking: the testers are friends and family with no bot, and chota keeps using Cast meanwhile.

1. **Spike: the smallest installable app.** Capacitor in `cast/`, `app.html` showing the existing demo board plus a key log (every key's `key`, `code`, `keyCode`, down and up). Leanback manifest, a plain banner. Sideload onto the Streamer over adb. Bundles the flush toilet and pop-up toaster figures for unknown 6. Answers the six unknowns above; adds the `dispatchKeyEvent` fallback only if needed.
2. **App shell.** `platform.ts` (Back, exit), the app's key map, keep-awake, screens cached in storage. Back rules as above.
3. **Standalone board.** `localTransport` with Open-Meteo and the time-zone city, the bundled facts, the Clock and Weather screens. Attribution line.
4. **Snake, and the closed test starts.** Game loop, held-key input, the pixel canvas, the Games screen. Create the Play listing, recruit 12 testers, and ship this build to a closed track. Every later slice goes to the same track.
5. **Maze, Breakout, Reaction.**
6. **Space and On this day.** `/daily.json` from a scheduled Worker on cast.khalido.dev, and the two screens.
7. **Mines and Lights.** Seeded generators, with tests that every level is solvable.
8. **Launch, Guess the rule, Maths sprint.**
9. **Play production.** Banner art, screenshots, privacy policy, Data safety form, the production application (the closed test has run since slice 4), then the TV review. Expect weeks before it's listed.
10. **Link service.** Worker + Durable Object: codes, the confirm on the TV, tokens, sockets, unlink, rate limits, the per-TV cap, the `/link` steps page. Tests for the pairing rules.
11. **Link screen and `linkTransport`.** Code, QR, the confirm, linked state, unlink.
12. **chota sends through the link.** `push()` over the service, the agent tool "link the TV", keys back to chota.
13. **How things work.** The fetch script with its fit stylesheet and manifest, the picker and player screen, the credits screen, and checking each candidate on the Streamer. About 3–4 days. Can move earlier, before slice 9, if testers want more than games.
14. **Voice (later).** "Play the morning briefing" through `SpeechRecognizer` and a plugin, sent to the agent as a `voice` message.

## Decisions for KO

1. **A public link service, run by you.** Linking needs a service both sides dial out to. It's one Worker on your Cloudflare account, free up to about 50 TVs, but it's yours to keep up for as long as the app is listed. Its abuse limits and privacy policy are yours too.
2. **"No backend" bends.** Weather, the clock and the games work with nothing of yours. Space and On this day come from a daily file on cast.khalido.dev, because NASA's free key can't serve many TVs. If the service is down, those two show yesterday's copy. The alternative is dropping them.
3. ~~Breakout instead of Pong~~ — decided 19 Nov: Snake, Breakout and Reaction, plus the play-and-learn list.
4. **Repo:** `cast/` in chota-bot (my pick) or a new repo now? Not in KO's open list on 19 Nov; I'm taking it as `cast/` unless KO says otherwise.
5. **On this day for kids:** show only births, holidays and a filtered set of events (my pick; a word list drops wars, attacks and deaths, and won't be perfect), or the whole feed?
6. **Play audience:** list the app for everyone (my pick), or for children too? Declaring under-13s brings in Play's Families policy: stricter review, rules on every SDK, and a stronger privacy policy.
7. **Testers:** TV only (`leanback required="true"`, my pick) means the 12 testers can opt in from a phone but only use it on a Google TV. Allowing phone installs would make testing easier but needs a phone layout nobody asked for.
8. **Name:** the listing needs one. "cast" clashes with Google Cast; Google may refuse a name that suggests it's theirs.
9. **How things work:** bundle about 12 community figures, curated and credited (my pick: 3–4 days, and the gallery keeps growing), or draw your own machines with the iso-figures skill? Drawing your own means sourcing each one from photos (your draft's rule) and runs to about an hour of agent time per figure plus review. Mixing the two is fine later.
