# Family memory — the home folder

**Status: design, not built (2026-10-15).** Replaces the JSONL memory plan (`data/memory/family.jsonl`) in [`agent.md`](agent.md) §Memory and [`plan.md`](plan.md). The dreaming pass and the "soul + memory define the agent" principle carry over.

## The idea

chota keeps what the family knows and cares about in a plain folder of markdown files — the **home folder** — one subfolder per area (home, car, school), one file or folder per project (a camera purchase, a trip). The Telegram agent reads and writes it through a few small tools. KO opens the same folder in Claude Code on the Mac to restructure it, refine the bot's soul, and review what the bot did. No new service: it's files, and git for history.

It's also the **folder split** chota already uses for config: code and safe defaults live in the chota repo; everything personal lives outside it. Today that's `chota.config.ts` and a gitignored `soul.md` at the repo root; the home folder becomes the one place for the personal layer.

## Layout

```
family-home/
  AGENTS.md          for coding agents (Claude Code on the Mac): layout, rules, how to tidy
  CLAUDE.md          one line: see AGENTS.md
  bot/
    soul.md          the bot's personality, tone, house rules — the family's layer, evolves with use
    memory.md        short always-loaded facts: who's who, preferences, pointers into the folders
    inbox.md         facts proposed from chats; the 03:00 pass promotes them into memory.md
  home/
    README.md        index for the folder
    appliances.md    models, warranties, manuals, service history
  car/
    README.md        rego date, service log, tyres
  projects/
    README.md
    camera-2026.md            one file while small
    japan-trip-2026/          a folder once it grows
      README.md
      itinerary.md
  artifacts/         pages and printouts the bot made (text only)
  files/             PDFs, photos, scans — gitignored, backed up separately (see §Files)
  log/
    2026-10.md       nightly "what the bot did today" notes
```

- **Every folder has a `README.md`** that indexes it. The bot loads only `bot/soul.md` and `bot/memory.md` per message and walks the indexes with its tools — cost per message stays flat as the folder grows.
- **Top-level folders are whatever the family cares about.** The bot may add one; `AGENTS.md` says how Claude Code should reorganise when it sprawls.
- **No secrets, ever:** no passwords, card or account numbers, ID/passport numbers. Stated in the base prompt and `AGENTS.md`; a gitleaks pre-commit hook blocks key-shaped strings.

## Prompt layers

Composed per call in `prompts.ts`, in this order:

1. **SOUL** — `bot/soul.md` from the home folder. Fallbacks unchanged: repo-root `soul.md`, then `soul.example.md`.
2. **MEMORY** — `bot/memory.md`: family-wide facts. This is also the family group's memory.
3. **PERSON** — `people/<name>.md` for whoever sent the message (DM or group sender): their interests, what they like the bot to do, how they like answers ("KO: short, links welcome, follows F1 and AI news"). The way chota takes over KO's personal yaad bot: same agent, a personal layer on top. ~4,000-char cap (yaad's number). KO edits his on the Mac; the bot proposes changes to `bot/inbox.md` and the 03:00 pass applies them — never a direct write, same rule as `memory.md`.
4. **STYLE + RULES** — in code: audience, tool use, kid safety, no secrets, the write rules below. Last, and says it wins, so an evolving soul can never loosen safety.
5. **TODAY + SNAPSHOT** — as now.

The personality text moves out of code into `soul.md`; code keeps only the mechanical and safety rules.

## Tools

Path-jailed to the home folder (resolve, then reject anything outside it; no symlinks followed out).

| Tool                                   | Does                                  | Notes                                                                                       |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `memory_list(dir)`                     | entries in a folder                   | returns names + first heading                                                               |
| `memory_search(query)`                 | text search across the notes          | ripgrep-style; saves walking folders for "what's the tyre pressure?"                        |
| `memory_read(path)`                    | one file                              | size-capped                                                                                 |
| `memory_patch(path, heading, content)` | replace one section                   | the default edit: models drop sections when they rewrite whole files                        |
| `memory_write(path, content)`          | create a file, or replace a small one | refused for `bot/`, `AGENTS.md`, `CLAUDE.md` and any `README.md` (indexes change by patch)  |
| `memory_append(path, text)`            | add to a file                         | for `log/` and `bot/inbox.md`                                                               |
| `save_artifact(name, content)`         | writes `artifacts/<name>`             | Telegram gets it as a document attachment (opens on any phone; a link would need Tailscale) |

**Nothing a chat says lands in the always-loaded prompt directly.** `bot/memory.md` is loaded into every conversation, so a chat message (or a web page the bot read) that got written there would steer every later chat. Chats append candidate facts to `bot/inbox.md`, which isn't loaded; the 03:00 dreaming pass reviews the inbox and promotes what's genuinely a fact into `memory.md`. `soul.md` and `AGENTS.md` change only from the Mac.

Every write is one git commit with the chat and turn in the message, so any bad write is a `git revert`.

## Sync — local-first, git

**Start Pi-only.** The Pi holds a bare repo `~/family-home.git` and the bot's working clone `~/family-home`. A small job commits and syncs every few minutes (`git add -A && git commit && git pull --rebase && git push`). The Mac clones over Tailscale SSH: `git clone chota:family-home.git`. Nothing leaves the house.

- **A conflict must not jam it.** If the rebase fails, the job runs `git rebase --abort`, keeps the local commits, alerts (Telegram + the uptime ping), and retries next tick. The bot keeps writing locally meanwhile; a person resolves it from the Mac.
- **Backed up nightly, not just mirrored:** the backup job also writes a `git bundle` of the bare repo next to the `home.db` backup. The Mac's clone is only as fresh as its last pull.

**Add GitHub later if wanted:** a private repo as a second remote, with a deploy key scoped to that one repo and 2FA on the account. Gains: a copy that survives both the Pi and the Mac, and browsing on github.com.

**Why git over a Drive folder:** history and diffs for every bot write (rollback is `git revert`), clean merges between the bot and the Mac, and Claude Code works natively on a repo. Drive's edge is family browsing on phones — met better by chota serving a read-only `/home` page that renders the folder (tailnet only). If Drive is ever wanted, it's a sync backend swap (`ko drive pull/push`), not a redesign:

```ts
// chota.config.ts
home: { dir: '~/family-home', sync: 'git' } // 'git' | 'drive' | 'none'
```

## Files — PDFs and photos stay out of git

Git is for text: every edit diffs, and the whole history is cheap. Manuals, receipts, scans and photos would bloat it permanently (and GitHub caps files at 100MB), so:

- **`files/` sits inside the home folder but is gitignored**, laid out like the notes (`files/car/`, `files/home/`). Markdown links to them by relative path — `[manual](../files/home/dishwasher-manual.pdf)` — so the notes stay the index.
- **On an SSD, not the SD card**, once photos arrive (see [`box.md`](box.md)).
- **Backed up by a nightly job, not git:** `rsync` to the Mac over Tailscale (stays in the house), or `rclone` to Drive through an **`rclone crypt`** remote, so Google only ever holds encrypted blobs. That's the answer to Drive's privacy problem if an offsite copy is wanted.
- The bot can list and read text out of them later (`ko doc` turns PDFs into text); writing binaries comes in only if a need shows up.

No git-lfs: it's one more moving part, and a self-hosted LFS server adds even more.

## Shared Google Docs and Sheets — the bot's Drive folder

A second store, for documents the family edits together (a trip planner Sheet, a shopping or budget Sheet, a packing list Doc). The git folder is the bot's private memory; this is the shared workspace. Memory notes link to the Drive docs by URL.

- **One folder, e.g. `Family/Chota`, inside the existing family Drive.**
- **The bot signs in as its own Google account** (e.g. `chota.home@…`), and only that folder is shared with it. Sharing is the scope: it can't see the rest of the family Drive. Not a service account: it has no storage quota, so it can't create files in a personal My Drive (that needs a Shared Drive, i.e. Workspace). A real account has its own quota. Setup steps in [`box.md`](box.md).
- **OAuth app set to "In production"**, not Testing, so the refresh token doesn't expire after 7 days. Personal use means a one-time "unverified app" warning, no review.
- **Tools wrap `ko`** (`ko gsheets`, `ko gdocs`, `ko drive`) under the bot account's tag, as typed tools, not a shell. `ko gsheets` already refuses to overwrite non-empty cells. Writes are logged; the morning print or a Telegram reply says what changed.

## Privacy

Local-first means nothing leaves the house by default: the bare repo and `files/` live on the Pi, the Mac clone travels over Tailscale. Each offsite option is opt-in and has its own guard:

| Offsite copy             | Holds                                   | Guard                                                                                  |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- |
| GitHub private remote    | the text notes                          | repo-scoped deploy key, 2FA, never change visibility, no-secrets rule + gitleaks       |
| Bot's Drive folder       | shared Docs/Sheets, plaintext by nature | only that folder is shared with the bot account; keep sensitive notes in git, not here |
| Drive via `rclone crypt` | `files/`, optionally the notes          | encrypted before upload; the key lives on the Pi + in KO's password manager            |

The model provider sees what the bot reads into a conversation — choose models/gateway settings accordingly (AI Gateway zero-retention needs a Pro plan).

## Dreaming, adapted

The 03:00 job keeps its job: read `bot/memory.md`, `bot/inbox.md`, the indexes and yesterday's chats; promote inbox items that are real facts; dedupe, prune, sharpen; write `log/<month>.md`. The old atomic-swap safety becomes git: the pass runs on a clean tree and lands as **one commit**, so a bad night is one `git revert`. It never edits `soul.md`.

## KO's Mac workflow

Open `~/family-home` in Claude Code to restructure notes, refine `bot/soul.md`, review `log/`, and fix what the bot got wrong. Push; the bot picks it up on the next sync — no deploy. Tools, base prompt and safety rules still change in the chota repo. Chat logs stay out of the folder; read them over `ssh chota`.

## Build order (after the Pi is the server)

1. `home.dir` config + `loadSoul()` reading `bot/soul.md`; move the personality text out of code.
2. Read-only tools (`memory_list`, `memory_read`) + `bot/memory.md` in the prompt.
3. Write tools + commit-per-write + the sync job.
4. `save_artifact` + Telegram document send.
5. Dreaming on the new layout.
6. The bot's Drive folder: bot Google account, `ko` installed with its tag, Sheets/Docs tools.
7. Optional: GitHub remote; `/home` read-only page.

## Open questions

- Who may write via Telegram — everyone, or parents only for some folders (`health/`)?
- Does the bot's write need confirmation ("save this to car/?") or just do it and say so?
- Artifacts in git while text-only; anything binary goes to `files/`.
