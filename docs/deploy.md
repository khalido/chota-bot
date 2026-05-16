# Deploy

The kiosk box is a Surface Pro 5 running Linux at the lounge wall. It hosts the SvelteKit app behind systemd, with the MUNBYN ITPP098P plugged into USB. Nothing fancy — `git pull`, build, restart.

**No CI, no auto-deploy.** Updates are manual SSH-from-Mac. The friction of typing the command is the deploy gate, and we don't want code shipping while the printer is mid-run at 06:45.

## Folder layout (kiosk box)

```
/home/ko/code/chota-bot/      # repo (mirrors ~/code/chota-bot on Mac)
  build/                       # adapter-node output (`npm run build` writes here)
  data/                        # runtime data (gitignored except data/quotes/)
    home.db                    #   sqlite — jobs, sessions, auth
    logs/chota.log             #   LogTape rotating file (planned; see docs/logging.md)
    morning/                   #   dev preview PNGs (production writes to tmpdir)
    sentral/<who>-timetable.ics  # per-kid Sentral .ics cache (one folder, files keyed by name)
  .env                         # secrets + KIOSK=true (gitignored, copied manually)
  chota.config.ts              # per-family config (gitignored)

/etc/systemd/system/chota.service   # symlink isn't supported by systemd — copy
```

The repo lives at `~/code/chota-bot` on both machines so paths in scripts are identical (Mac dev → Linux box). The systemd unit hard-codes `/home/ko/...` because systemd doesn't expand `~`.

## First-time bootstrap (fresh box)

Assumes Node is installed via fnm with `/usr/local/bin/node` symlinked to `~/.local/share/fnm/aliases/default/bin/node` (so systemd can find it). See `docs/printers.md` for libusb-dev install. Also needs `sqlite3` on PATH for the first-time DB init step (`sudo apt install sqlite3` on Debian/Mint).

```bash
# 1. Clone (in ~/code, mirroring the Mac layout)
mkdir -p ~/code && cd ~/code
git clone <repo-url> chota-bot
cd chota-bot

# 2. Install Node deps
npm ci

# 3. Install agent-browser (the production HTML→screenshot print path needs it)
npm install -g agent-browser
agent-browser install                 # downloads Chromium (~150MB, one-time)
sudo ln -sf ~/.local/share/fnm/aliases/default/bin/agent-browser /usr/local/bin/agent-browser

# 4. Copy secrets from your Mac (one-time)
#    From the Mac:  scp .env chota.config.ts chota:~/code/chota-bot/
#    Then on the box, append PORT + KIOSK to .env (these aren't in your dev .env):
printf '\nPORT=8000\nKIOSK="true"\n' >> .env
#    Also sanity-check DATABASE_URL — sv create scaffolds it as `local.db` but
#    .env.example uses `data/home.db`. Whichever you pick, the kiosk's .env and
#    the path in deploy.sh's first-time DB init must match. Recommend:
#      sed -i 's|^DATABASE_URL=.*|DATABASE_URL=data/home.db|' .env

# 5. udev rule — non-root USB access to the printer (without this: LIBUSB_ERROR_ACCESS)
sudo cp deploy/99-munbyn-printer.rules /etc/udev/rules.d/
sudo udevadm control --reload-rules
sudo udevadm trigger --attr-match=idVendor=0483

# 6. Build
npm run build

# 7. Install + enable the systemd unit
sudo cp deploy/chota.service /etc/systemd/system/chota.service
sudo systemctl daemon-reload
sudo systemctl enable --now chota
sudo systemctl status chota          # should be active (running)

# 8. Verify
curl -s http://localhost:8000/ | head -1               # should return HTML
curl -s -X POST http://localhost:8000/api/print/test   # column ruler — should print
journalctl -u chota -f                                 # tail server logs
```

## When you upgrade Node (fnm)

fnm scopes globals per Node version, so a `fnm default <new>` orphans them. The `/usr/local/bin/*` symlinks themselves keep working (they go through `aliases/default`, which fnm updates), but you have to reinstall the globals on the new version.

[`fnm.py`](https://github.com/khalido/dotfiles) (in the `khalido/dotfiles` repo, cloned to `~/code/dotfiles` on the SP5) automates this — it installs latest LTS, sets it as default, and reinstalls every global you had:

```bash
ssh chota 'uv run ~/code/dotfiles/fnm.py upgrade'
ssh chota 'agent-browser install'        # only if the Chromium ABI changed
ssh chota 'sudo systemctl restart chota'
```

Manual fallback if `fnm.py` ever breaks:

```bash
fnm install v26 && fnm default v26
npm install -g agent-browser
agent-browser install
sudo systemctl restart chota
```

Caddy reverse-proxy and mDNS are listed at the bottom as optional hardening — not Phase 1 blockers.

## Deploy ritual

From your Mac:

```bash
npm run deploy    # = ssh chota 'cd ~/code/chota-bot && bash deploy/deploy.sh'
npm run logs      # = ssh chota 'sudo journalctl -u chota -f'
```

(`chota` is an SSH alias for the kiosk box — see `~/.ssh/config`.) The deploy script is idempotent (re-running with no new commits is a no-op):

1. `git fetch` + `git pull --ff-only origin main` (fails loudly on a non-fast-forward — investigate, don't paper over)
2. If `package-lock.json` changed → `npm ci`
3. If `drizzle/` or `src/lib/server/db/auth.schema.ts` changed → `npx drizzle-kit push`
4. `npm run build` (always)
5. `mkdir -p data data/logs` (cheap; tool-specific subdirs like `data/sentral/` are created on demand by the writing code)
6. `sudo systemctl restart chota` + verify it came up

If step 6 fails, the script exits non-zero and you'll see it in the SSH output. Then:

```bash
ssh chota 'sudo journalctl -u chota -n 100 --no-pager'
```

## Updating secrets / config

`.env` and `chota.config.ts` are gitignored — they don't ride the deploy script. To change them:

```bash
# Edit on the Mac, scp over, restart
scp .env chota:~/code/chota-bot/.env
ssh chota 'sudo systemctl restart chota'
```

The Sentral cookies expire periodically — same drill, just edit `.env` and restart.

## Rollback

Pin to a previous SHA and re-deploy:

```bash
ssh chota 'cd ~/code/chota-bot && git checkout <sha> && bash deploy/deploy.sh'
```

(`deploy.sh` will see the SHA already matches origin and bail at the "nothing to deploy" check — so when rolling back, run the build + restart steps directly:)

```bash
ssh chota 'cd ~/code/chota-bot && git checkout <sha> && npm ci && npm run build && sudo systemctl restart chota'
```

Once main moves past the bad commit, a normal deploy will fast-forward back onto it.

## Useful commands on the box

```bash
sudo systemctl status chota          # is it up?
sudo systemctl restart chota         # restart without redeploying
sudo systemctl stop chota            # stop (e.g. while debugging)
journalctl -u chota -f               # tail stdout/stderr
journalctl -u chota --since '1h ago'

tail -f data/logs/chota.log          # (when LogTape lands — see docs/logging.md)
```

**From the Mac** (Tailscale SSH makes any of these one command — no need to keep an SP5 terminal open):

```bash
ssh chota 'sudo journalctl -u chota -f'      # live tail, Ctrl-C to exit
ssh chota 'sudo systemctl status chota'
ssh chota 'curl -s -X POST http://localhost:8000/api/print/test'   # printer smoke test
```

## Optional hardening

Not Phase 1 blockers — wire when the need shows up.

- **Caddy reverse proxy** — `:80` → `:8000`, plus mDNS so `chota.local` resolves on the home LAN. Lives in `deploy/Caddyfile` once added.
- **mDNS** — `avahi-daemon` already broadcasts the hostname; nothing extra needed if the hostname is `chota`.
