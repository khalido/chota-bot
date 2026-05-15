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

```bash
# 1. Clone (in ~/code, mirroring the Mac layout)
mkdir -p ~/code && cd ~/code
git clone <repo-url> chota-bot
cd chota-bot

# 2. Install Node deps
npm ci

# 3. Copy secrets from your Mac (one-time)
#    From the Mac:  scp .env chota.config.ts chota:~/code/chota-bot/
#    Then on the box, set KIOSK=true in .env (the morning-print job no-ops without it).

# 4. Build
npm run build

# 5. Install + enable the systemd unit
sudo cp deploy/chota.service /etc/systemd/system/chota.service
sudo systemctl daemon-reload
sudo systemctl enable --now chota
sudo systemctl status chota          # should be active (running)

# 6. Verify
curl -s http://localhost:8000/ | head -1     # should return HTML
journalctl -u chota -f                       # tail server logs
```

Caddy reverse-proxy + udev rules are listed at the bottom as optional hardening — not Phase 1 blockers.

## Deploy ritual

From your Mac:

```bash
ssh chota 'cd ~/code/chota-bot && bash deploy/deploy.sh'
```

The script is idempotent (re-running with no new commits is a no-op):

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

## Optional hardening

Not Phase 1 blockers — wire when the need shows up.

- **Caddy reverse proxy** — `:80` → `:8000`, plus mDNS so `chota.local` resolves on the home LAN. Lives in `deploy/Caddyfile` once added.
- **udev rule for the MUNBYN** — non-root USB access, so the systemd unit doesn't need `User=root`. Lives in `deploy/99-munbyn-printer.rules` once added (`sudo cp` + `udevadm control --reload`).
- **mDNS** — `avahi-daemon` already broadcasts the hostname; nothing extra needed if the hostname is `chota`.
