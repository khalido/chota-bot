# Artifacts — quick phone-friendly pages from chat

**Status: idea (2026-10-16); a v0 from the chat agent is planned below (19 Oct).** Someone in the family asks in chat — "make a countdown to the Japan trip", "a tip splitter", "a packing checklist for camp", "a times-tables game for Kid3" — and chota builds a small page and replies with a link like `bhalu.chotabot.com`. Opens on any phone, nothing to install.

## v0 — pictures and pages from the chat agent (planned, 19 Oct 2026)

A stopgap before the builder below: the chat agent makes these itself, in one turn, no sandbox.

**What WhatsApp does (tested 19 Oct from the bot number):** a PNG shows inline and takes a caption. An `.html` document opens in Chrome on Android with JavaScript working; WhatsApp on the Mac previews it with no JavaScript. An `.svg` arrives as a download link. So: pictures as PNG, interactive pages as links. `scripts/whatsapp-spike.mjs --send <file> [--caption "…"]` sends any of these.

**Explainer pictures — `draw_explainer({ title, svg, caption })`.** "Draw me how a toaster works": a cartoon cutaway or pulled-apart drawing for an 8–10-year-old, plus the explanation as the caption. The agent writes only the drawing; the server adds the frame and renders a PNG with `@napi-rs/canvas` (already used for prints), then sends it to WhatsApp or Telegram, or the printer. The rules, much looser than KO's `iso-figures` skill for real objects:

- Cartoon, simplified, not to scale; pull parts apart where it helps. What it explains must be true.
- Portrait 800 × 1000. Title ~48 px, labels ~38 px (a phone shows the image ~380 pt wide), at most 6 labels of one or two words, each with a leader line ending in a dot. The renderer drops SVG `marker`s, so no arrowheads.
- The "why" goes in the caption, not the picture: 2–4 short sentences.
- The frame supplies the paper background, the colours and one `feTurbulence` + `feDisplacementMap` filter that makes plain shapes look hand-drawn, so the agent draws ordinary rects and paths and stays fast. Bundle a hand font (Patrick Hand, OFL) with `GlobalFonts.registerFromPath`; the system fallback is a plain sans.
- **Recognisable first** (KO, 19 Oct, on the toaster test): the first try was too abstract to read as a toaster. Show the whole thing, assembled and recognisable, then the pulled-apart or cutaway view beside or below it. Simple, not abstract.
- **Reference drawings make it faster and better:** keep 3–5 good finished examples in the repo (say `src/lib/server/draw/examples/`), one per kind (a machine pulled apart, a cutaway, a cycle such as rain, a size comparison), and give the drawing model one or two of the closest as examples. Add a new one whenever a drawing comes out well.
- Open: which model draws. The chat model may be weak at SVG; a stronger model behind the tool (the book-agent pattern) costs a few seconds.

**Pages — `publish_page({ title, summary, body })`.** For a write-up with a bit more in it (compare three options, a weekend plan, a packing checklist). The agent writes the `<main>` body from a small kit of classes; the server wraps it in the house shell (kit CSS, light and dark, og tags for the link card, footer). Kit v0: `callout`, `cards`/`card`, `tags`, `pro`/`con`, `scroll` + table, `check` (ticks saved on that phone), `tabs`, `btn`. A new piece joins the kit when a page needs it.

- **Served by chota itself**, at `/p/<random>`, with `Content-Security-Policy: sandbox allow-scripts`: the page's script runs in an opaque origin, so it can't use a signed-in session or reach `/api` on the same host.
- **Public or private, per page.** Kids will want some pages public (a countdown, a game to share), so there is no login in front of the whole site. A public page needs nothing and gets WhatsApp's link card. A private page (anything from a family chat with names, lists, plans) needs a login: **an OTP over WhatsApp**, through better-auth's `phone-number` plugin (installed). `sendOTP` sends the code from the bot number; `phoneNumberValidator` allows only numbers in `chota.config.ts > family[]`, so codes can't be sent to anyone else; `signUpOnVerification` creates accounts for kids with no email. Sessions last about a month. SMS as a later fallback inside `sendOTP`.
- **Reach from outside the house: a Cloudflare Tunnel** (`cloudflared` on the Pi as a systemd service, outbound only, no open ports; needs a domain on Cloudflare). Its ingress rules expose only the pages and the login (`/p/*`, the login page, `/api/auth/*`); every other path returns 404, so `/admin`, the rest of `/api` and the LAN-open kiosk pages stay inside. No Cloudflare Access: the kids have no email for its code, and public pages must stay public. **Tailscale stays for KO** to manage the Pi (SSH, deploy, `/admin`).
- Build order: the kit and `publish_page` (links over Tailscale to test) → WhatsApp OTP and private pages → the domain and the tunnel.

## Shape

```
chat ask ──▶ chota agent ──▶ builder (fast coding loop) ──▶ static files ──▶ published at <word>.<domain>
                 ▲                                                               │
                 └──────────── link back in the chat (+ one-time login) ◀────────┘
```

- **Artifacts are static files** — one `index.html` plus maybe a script, a stylesheet, an image. No server code, no database per artifact. That keeps the builder's job small and the hosting trivial.
- **Builder v1: no sandbox at all.** A `ToolLoopAgent` (fast model) with one tool, `write_file(path, content)`, jailed to `artifacts/<slug>/`: resolve the path and check the prefix, an extension allowlist (`.html .css .js .svg .png .json`), size caps. No shell and no network, so there's nothing to sandbox. Most artifacts are one HTML file anyway.
- **Builder v2, if v1 runs out of road** (multi-file builds, running a bundler, tests): a real coding agent through an AI SDK harness (`HarnessAgent`). Installed adapters include fx, OpenCode and Pi; sandbox providers today are `@ai-sdk/sandbox-vercel` (hosted microVM) and `@ai-sdk/sandbox-just-bash` (bash simulated in JS over a virtual filesystem; the docs say host-runtime harnesses like Pi can run in it). fx and OpenCode connect "via ACP" / "bridge", so they need a real sandbox. On the Pi that means wrapping the run in [Anthropic's `srt`](https://github.com/anthropics/sandbox-runtime) (bubblewrap + seccomp, network deny-all through a domain-allowlist proxy, arm64 supported — untested on a Pi) or a rootless Podman container with `--network none`. [Docker Sandboxes](https://www.docker.com/products/docker-sandboxes/) are microVMs — arm64/Pi support unverified and heavy for 4 GB. Vercel Sandbox is the off-Pi option: a 5-minute 2-vCPU job is about $0.009, but prompts and code leave the house.

## Hosting and the domain

- **Buy a domain for the bot** (e.g. `chotabot.com`). The bot's own pages and login live on it.
- **Paths under one artifacts domain** (`<domain>/<word>`), on an app separate from chota's admin and API — see the Railway shape below for why that's safe enough. (First draft had a subdomain per artifact; dropped for simplicity.) A strict CSP on every artifact still applies.
- **Where it's served from:** the Railway app below. The Pi-behind-a-Cloudflare-Tunnel option stays as the in-house fallback.

## Names

One memorable word per artifact — `bhalu`, `sillyputty`, `boo`. The builder picks a word that fits what it built (a countdown to Japan → `sakura`), from English or Hindi/Urdu everyday words; a small table of used names rejects collisions ("taken, pick another"). Words are guessable, so a name is not a secret: anything private needs a login (below).

## Login — one-time token from the chat

better-auth's [one-time-token plugin](https://better-auth.com/docs/plugins/one-time-token) (in the installed version): chota sends a link carrying a short-lived single-use token; opening it on the phone creates a normal session and the browser is remembered. No passwords, no Google sign-in for the kids. Uses:

- **Private artifacts** (a family packing list, anything with names) check the session; public ones (a countdown) don't.
- **Editing** — "add sunscreen to the camp list" updates the artifact the person is logged in to.
- **Only family members create or publish.** The cautionary tale is Glitch: free anonymous hosting turned it into a phishing host. chota only builds for allowlisted senders.

## Lifetime and housekeeping

- Expire after ~30 days without a view unless pinned; a chat command lists and deletes yours.
- A per-person quota (say 20 live artifacts).
- Every page carries a small "made by chota for <family>" footer and a report/takedown link to the parents.

## Leading shape: an artifacts app on Railway, built in a Railway Sandbox (KO, 2026-10-16)

One repo, `artifacts`: a SvelteKit app where each artifact is a route (`/bhalu`, `/sakura`), plus an index and an admin page. A coding agent grows it; Railway hosts it.

```
chat ask ─▶ chota ─▶ Railway TS SDK: Sandbox.create()  (VM, git + Node + coding agents preinstalled)
                         │  clone artifacts repo
                         │  coding agent writes src/routes/<word>/, our skills + house rules
                         │  npm test, build, agent-browser screenshot at phone width
                         │  git push
                         ▼
               Railway app redeploys from the push ─▶ artifacts.<domain>/<word>
chota ◀── link + screenshot back in the chat; sandbox destroyed (or idles out)
```

- **[Railway Sandboxes](https://docs.railway.com/sandboxes):** isolated Linux VMs, created and driven from TypeScript (`npm install railway`, `Sandbox.create()`, `sandbox.exec()`, `sandbox.files`), checkpoints and forks (a pre-warmed checkpoint with the repo cloned and `node_modules` installed makes each build start fast), outbound internet by default. Billed per second at $50 per vCPU-month and $50 per GB-month — a 5-minute build on 2 vCPU / 2 GB is about 2¢. Hobby allows 4 vCPU / 4 GB and a 30-minute idle timeout.
- **Git is the hand-off,** not a publish call: the sandbox pushes, Railway deploys from the repo. That gives history, review and rollback (`git revert`) for free, and chota needs no deploy permissions — only a sandbox token and a repo-scoped deploy key inside the sandbox.
- **Always start from the latest repo.** KO also works on the artifacts repo from his Mac's coding agent, so every build begins with `git pull` (or a fresh clone) before the agent touches anything — the warm checkpoint only saves `node_modules`, never the code. The sandbox pushes to a branch and rebases on `main` before merging; a conflict stops the build and reports back rather than force-pushing.
- **Which coding agent:** OpenCode is preinstalled in Railway's sandbox image; fx installs in seconds. Try both on the first few artifacts and keep the better one. Either can run through an AI SDK harness (`@ai-sdk/harness-opencode`, `@ai-sdk/harness-fx`) if we want its progress streamed into chota's chat, or as a CLI via `sandbox.exec()` if not. Give it the artifacts repo's own `AGENTS.md` (stack, the shared kit, size and privacy rules) and skills.
- **Paths, not subdomains — acceptable with conditions.** The risk with paths is one artifact's JS acting with the logged-in user's cookies on the same origin. It's contained if: the artifacts app is its **own domain/app**, never chota's admin or API; session cookies are `HttpOnly` + `SameSite=Lax` (better-auth's default); a CSP limits `connect-src` to the app itself; and anything that mutates (admin, delete) re-checks the session server-side. Our agent writes the code, not users, so the residual risk is the agent being steered by content it read — keep the builder's web access off unless a build needs it.
- **Stack:** SvelteKit — KO's preference for speed. Agents are strongest at React; judge Svelte build quality on the first few artifacts.
- **Login:** better-auth email OTP, or the one-time token link from chat.

**A growing kit, opinionated choices.** Because every artifact lives in one app, the agent builds on shared pieces rather than starting from scratch: touch-friendly components (big tap targets, swipe, phone-first layouts), one chart library, one animation approach, a countdown, a checklist, a quiz/game shell. Pick each once and write it into the repo's `AGENTS.md` so the agent reuses instead of reinventing; add a new piece only when an artifact needs it, then it's available to the next one.

**Artifacts that need AI** (streaming text, a small agent — a story generator, a quiz that adapts) call a server route in the artifacts app, never the model from the browser. The app holds its own AI Gateway key with a hard spend cap and one fast, cheap model set by default, so a runaway page costs a few dollars at most. Rate-limit per page and per logged-in person.

**Or a resident builder on the Pi** — worth exploring alongside Railway. Instead of a fresh VM per build, one artifact-builder agent lives in a folder on the Pi (`~/artifacts`, a git clone), idle until chota hands it a brief. Its appeal: it keeps context between builds, and the folder is easy to look after — KO opens it from the Mac (over Tailscale, or pulls the repo), reads what it did, improves it, and adds skills and an `AGENTS.md` that make a cheaper agent good at this one job, the same way as the family home folder ([`memory.md`](memory.md)). Isolation from the rest of the Pi comes from a light sandbox around the agent process — [`srt`](https://github.com/anthropics/sandbox-runtime) (bubblewrap + seccomp, writes only to `~/artifacts`, network only to npm, GitHub and the AI Gateway) or a rootless Podman container. Costs: builds share the Pi's 4 GB with chota and the print Chromium, so cap the builder's memory and run one build at a time; the published site still lives on Railway, so it's up when the Pi is off.

## From ask to live — the conversation

```
1. ask        "make a scoring app for Kid1's volleyball"            (text or voice note)
2. clarify    chota asks 1–3 questions it can't answer itself        ("sets to 25? both teams' names?")
3. plan       one tight message: what it'll build, the word, roughly how it'll look
              ▸ Go   ▸ Change   ▸ Cancel                             (buttons on Telegram, a numbered reply on WhatsApp;
                                                                       "change" takes text or a voice note)
4. build      chota (TS, Railway SDK) starts a sandbox, hands the coding agent the brief + plan
5. updates    agent → chota: "done" / "failed: why" / "question: …"  → chota relays a question to the person, sends the answer back
6. live       link + phone-width screenshot in the chat; sandbox idles, then stops
7. later      "make the buttons bigger" → same artifact, new build
```

- **The brief** chota assembles at step 4 is the whole contract: the ask, the answers, the approved plan, who it's for, private or public, the word. Written into the artifact's folder as `brief.md`, so it travels with the code.
- **Talking back (step 5):** chota starts the agent and holds its stream — through an AI SDK harness, or `sandbox.exec()`, whose commands are durable and can be reattached by session name after a chota restart. The agent ends with a structured result (`done` / `failed` / `question`), or calls an `ask_user` tool mid-build; chota relays it and resumes with the answer. Nothing has to reach the Pi from outside, which suits a Pi behind Tailscale.
- **What's live** is the artifacts repo's routes — no separate registry of artifacts.
- **Sandbox lifecycle — checkpoint, then destroy.** Railway bills a sandbox while it exists and counts it against plan limits ([docs](https://docs.railway.com/sandboxes): destroy when done, keep idle timeouts short, checkpoint reusable state). So when the agent reports done (or failed), chota checkpoints the sandbox as `artifact-<word>` and destroys it straight away (`await using` in the SDK destroys on scope exit). A follow-up within a few minutes can still hit a live sandbox if one's open; otherwise it boots from the checkpoint.
- **No run log needed for cleanup:** Railway lists both — `sandbox list --json --all` and `sandbox checkpoint list --json` (and the SDK equivalents) — so the nightly job reads Railway: delete `artifact-*` checkpoints older than ~14 days, destroy any `artifact-*` sandbox running over an hour. chota keeps only which chat asked for which word, with the chat history.

**Railway sandbox practice** (from the `use-railway` skill's `references/sandbox.md` and Railway's [agents-in-sandboxes guide](https://docs.railway.com/guides/agents-in-sandboxes)):

- **Enabled** on KO's Railway workspace (2026-10-16) and already in use in the syntechfibres project — look there for working code before writing ours. Still experimental; every command warns the API may change.
- **Start simple while things change:** use the image's built-in agent (OpenCode), no installs, so a build is just clone/`git pull` → agent → push. The base checkpoint only earns its place once `npm ci` is slow enough to matter.
- **Pushing from the sandbox:** a fine-grained GitHub token scoped to the artifacts repo only (Contents: read and write), passed as a `--variable` at create time and used as `https://x-access-token:$GH_TOKEN@github.com/…`. Easier than an SSH deploy key (no key file to write into the VM) and never in a checkpoint. Rotate it on a schedule.
- **Two checkpoint layers.** A base `artifacts-base`: the default image (git, Node, OpenCode and other harnesses preinstalled) plus the repo cloned and `npm ci` done — rebuild it when dependencies change. Then `artifact-<word>` per artifact after a build. Every build still `git pull`s first. Reusing a checkpoint name replaces it silently — that's what we want for `artifact-<word>`, nothing else.
- **Secrets at create time, not in snapshots.** Checkpoints keep the disk only; variables and network mode are re-passed on every create. So pass the capped AI Gateway key and a repo-scoped deploy key as `--variable`s, rather than signing agents in interactively (the guide's `agent-box` pattern) — then no checkpoint ever holds a credential. The SDK itself reads `RAILWAY_API_TOKEN` and `RAILWAY_ENVIRONMENT_ID` from chota's env.
- **Long builds detach:** run the agent with `exec --detach` and reattach by session name to stream progress; durable sessions aren't available on every sandbox, so handle the "ran attached" fallback. `exec --timeout` exits 124 on the client deadline — "too slow", not "failed".
- **Default network is isolated with public egress** — right for a builder that needs npm and the AI Gateway; no `--private-network` (it doesn't need Railway's internal services).
- **Templates are CLI-local** (recipes live on the machine that built them), so a server like chota uses checkpoints, which are stored server-side per environment.
- **Idle timeout is the backstop, not the cleanup** — destroy explicitly (`await using`).
- **Prior art:** Railway's [Repo Review Agent](https://github.com/codyde/repo-review-agent) — create from a prepared checkpoint → clone → install → checkpoint → one sandbox per agent → destroy, in `src/lib/review.server.ts`. The same loop as ours.
- **Updates (step 7):** the repo, `brief.md` and a short `notes.md` the agent writes at the end are the artifact's memory, so a fresh sandbox can always pick it up; a checkpoint only makes it faster. Losing a checkpoint costs a slower build, nothing else.
- **Limits:** one build per person at a time, a daily cap, and a spend cap on the sandbox's AI key.

## Sandbox options compared (2026-10-16)

| Option                                                                                                          | Isolation                                                                      | Runs on the Raspberry Pi?                                                                         | Fit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Railway Sandboxes**                                                                                           | VM per sandbox, hosted                                                         | no (hosted)                                                                                       | Leading for hosted builds: TS SDK, checkpoints, OpenCode preinstalled, already used in the syntechfibres project.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **[Vercel Sandbox](https://vercel.com/docs/vercel-sandbox)**                                                    | Firecracker microVM, hosted                                                    | no (hosted)                                                                                       | The equal alternative: GA, `@vercel/sandbox` SDK, millisecond starts, default image with Node, Python and coding agents, **persistent sandboxes that auto-save on stop** (no manual checkpoints), Active-CPU billing (no CPU charge while waiting on the model; ~$0.06 for an hour at 1 vCPU / 2 GB, 10% busy). From the Pi it needs a Vercel access token. Also the AI SDK harnesses' native sandbox (`@ai-sdk/sandbox-vercel`).                                                                                                                                                                          |
| **[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/)** (`sbx`)                                           | microVM, local or Docker cloud                                                 | only on Ubuntu 24.04+ (arm64 listed) with KVM — not on Raspberry Pi OS                            | Per the [install page](https://docs.docker.com/ai/sandboxes/install/): Linux means Ubuntu 24.04+; other distros (Debian, derivatives like Pop!_OS) aren't tested or supported. A Pi 5 could only run it by switching the box from Raspberry Pi OS to Ubuntu, against [`box.md`](box.md)'s OS choice (first-party DSI panels). A microVM per sandbox is also heavy for 4 GB. Needs a Docker sign-in; local use is free, cloud sandboxes are pay-as-you-go. Polished, with per-agent kits and network presets — a good fit on a Mac or an Ubuntu box, not this one.                                          |
| **bubblewrap (`bwrap`)**                                                                                        | Linux namespaces, no VM                                                        | yes                                                                                               | The primitive under srt, Flatpak and the two below. Light (no daemon), but kernel-shared: one third-party report of an agent escaping a bwrap sandbox through the dynamic linker.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **[srt](https://github.com/anthropics/sandbox-runtime)**                                                        | bwrap + seccomp + domain-allowlist proxy                                       | yes (arm64 filters shipped; untested on a Pi)                                                     | The heavily used one: `@anthropic-ai/sandbox-runtime` ~560k npm downloads a week, ~5.6k stars, Apache-2.0 — what Claude Code's own sandbox is built on. "Write here, reach only npm/GitHub/Gateway" is exactly its job. No credential injection: secrets passed in are visible inside.                                                                                                                                                                                                                                                                                                                     |
| **[nono](https://nono.sh/)** ([GitHub](https://github.com/always-further/nono))                                 | Landlock on Linux (kernel 5.13+), Seatbelt on macOS; network through its proxy | yes — `arm64` .deb and aarch64 builds in v0.80.0 (2026-10-13); Landlock on the Pi kernel untested | Strongest local candidate. Apache-2.0, ~4.5k stars, active. Supports OpenCode, Pi, Claude Code, Codex and others. **Phantom tokens:** the agent gets a stand-in and the proxy injects the real credential at the boundary, so the GitHub token and AI key never sit inside the sandbox. Domain/method/path network rules, JSON profiles, filesystem snapshots for undo, a hash-chained audit log, approve/deny for out-of-policy actions. Landlock needs no user namespaces, so it sidesteps the AppArmor issue bwrap hits on Ubuntu. Same tool on the Mac. GitLab is evaluating it as an srt alternative. |
| **[Sandkasten](https://github.com/grothesque/sandkasten) + [Sandburg](https://github.com/grothesque/sandburg)** | bwrap, outer + inner                                                           | yes                                                                                               | Built for the **Pi coding agent** ([pi.dev](https://pi.dev)): Sandkasten (`skn`) limits what the agent process sees; Sandburg cuts network from its tool calls and stops background processes. Small, one author, no independent review. A natural pair if the resident builder runs the Pi agent.                                                                                                                                                                                                                                                                                                         |

**Read:** hosted builds → Railway (in use) or Vercel (persistence and Active-CPU billing are the draws). A resident builder on the Raspberry Pi → **srt or nono**, both good: srt is the proven, heavily used default; nono adds credential injection and undo. Try both on the Pi (srt needs bubblewrap and user namespaces, nono needs Landlock) and keep whichever works cleanly. Sandkasten + Sandburg only if it's the Pi agent and neither suits. Not Docker Sandboxes on the Pi.

## Web access for the builder (srt)

srt denies all network by default; allowed domains go in `network.allowedDomains`. The builder needs research (look up an API, a library's docs) without that becoming a hole. Two ways, and they combine:

1. **Research as tools, network stays narrow (preferred).** Give the coding agent `web_search` and `web_fetch` as tools that run **outside** the sandbox — chota's own (Exa search with highlights, Browserbase fetch; [`agent.md`](agent.md) §Models), passed to the harness as custom AI SDK tools, or reached through the AI Gateway's server-side tools. The sandboxed shell's allowlist stays at npm, GitHub and the AI Gateway. Research works, but a page the agent read can't make its shell `curl` the GitHub token somewhere — the classic prompt-injection exfiltration path stays shut.
2. **Open network with a guard.** srt's ask callback (`SandboxManager.initialize(config, ask)`) is consulted for any host no rule decides; returning `true` allows it. So "open" is a callback that allows everything except a short `deniedDomains` list, private/LAN ranges and cloud metadata (srt's proxy already refuses loopback, link-local and metadata), and logs every host. Simpler for the agent, weaker against exfiltration — the deny-reason text even reaches the model, so it learns what was blocked.

**Decided start: option 1** plus a generous static allowlist; move to 2 only if builds keep tripping on blocked hosts. The allowlist:

- **Packages and CDNs:** registry.npmjs.org, unpkg.com, cdn.jsdelivr.net, github.com / api.github.com / raw.githubusercontent.com.
- **Docs:** developer.mozilla.org, svelte.dev, kit.svelte.dev, the chosen chart/animation libraries' sites.
- **Ideas from Hacker News:** hn.algolia.com (its API: `hn.algolia.com/api/v1/search?query=…&tags=story` or `tags=comment`, `numericFilters=created_at_i>…` for the last two years, `search_by_date` for newest first) and news.ycombinator.com.
- **[Context7](https://context7.com/)** for current library docs: set up its MCP in the base image (`npx ctx7 setup`, KO has an API key) and allow context7.com. The key goes in as a create-time variable like the others, never into a checkpoint.
- **The AI Gateway** (ai-gateway.vercel.sh), which also carries the agent's model calls and the `web_search` / `web_fetch` tools.

## Open questions

- Domain name and DNS (Cloudflare fits both hosting options).
- Pi + Tunnel vs static host.
- Can an artifact save state (checklist ticks shared across phones)? That breaks "static only" — maybe one tiny per-artifact JSON store behind the login.
- Which model builds: the agent's fast model, or a stronger one just for builds (quality matters more than latency here — the kids wait a few seconds anyway).

## Prior art to read before building

Claude's own artifacts (publish + share), val.town (progressive trust before hosting privileges), v0, Websim, Telegram Mini Apps. Search turned up little first-hand; Glitch's phishing problem (Netskope: 3.3× rise in early 2025) is the one well-documented lesson.
