# Deploy

The kiosk box is a Surface Pro 5 running Linux at the lounge wall. It hosts the SvelteKit app behind systemd, with the MUNBYN ITPP098P plugged into USB. Nothing fancy — `git pull`, build, restart.

**No CI, no auto-deploy.** Updates are manual SSH-from-Mac. The friction of typing the command is the deploy gate, and we don't want code shipping while the printer is mid-run at 06:45.

## Folder layout (kiosk box)

```
/home/ko/code/chota-bot/      # repo (mirrors ~/code/chota-bot on Mac)
  build/                       # adapter-node output (`npm run build` writes here)
  data/                        # runtime data (gitignored except data/quotes/)
    home.db                    #   sqlite — jobs, sessions, auth
    logs/chota.log             #   LogTape rotating file (see docs/logging.md)
    morning/                   #   dev preview PNGs (production writes to tmpdir)
    sentral/<who>-timetable.ics  # per-kid Sentral .ics cache (one folder, files keyed by name)
  .env                         # secrets + KIOSK=true (gitignored, copied manually)
  chota.config.ts              # per-family config (gitignored)

/etc/systemd/system/chota.service   # symlink isn't supported by systemd — copy
```

The repo lives at `~/code/chota-bot` on both machines so paths in scripts are identical (Mac dev → Linux box). The systemd unit hard-codes `/home/ko/...` because systemd doesn't expand `~`.

## First-time bootstrap (fresh box)

Two phases. **Phase 1 (steps 1–8) brings chota up as a service** — agent, jobs,
dashboard, printer pipeline all work. The dashboard is reachable in any
browser at `http://localhost:8000/` (or via Caddy at port 80; or from another
machine over Tailscale). This is enough for most boxes — including any
not-yet-touchscreen setup where you'll open the dashboard in a browser
manually when you want to look at it.

**Phase 2 (kiosk display mode, steps 9–10) is opt-in and currently deferred** —
auto-login + fullscreen Chrome autostart + screensaver-off. Only run those
when you have the box physically wired to a dedicated kiosk display
(touchscreen or otherwise) and want chota to come up on the screen at boot.
The commands as written target Cinnamon (the SP5's Mint install); they need
a Pop!\_OS / GNOME rewrite before they're useful again.

Assumes Node is installed via fnm — `chota.service` points directly at `~/.local/share/fnm/aliases/default/bin/node`, so no `/usr/local/bin` symlink to maintain. `node-usb` ships libusb statically linked, so no apt libusb either. See [`docs/printers.md`](printers.md) for the full USB story.

### Phase 1 — core chota (always run this)

```bash
# 0. Host prep (one-time, sudo). Brings a fresh Pop!_OS / Ubuntu box to a
#    chota-ready baseline:
#      - sqlite3 for the first-time DB init
#      - plugdev so node-usb can open /dev/bus/usb/* as non-root
#      - cups + cups-browsed disabled and usblp blacklisted so neither
#        userspace nor the kernel claim the MUNBYN out from under us
sudo apt install -y sqlite3
sudo usermod -aG plugdev "$USER"
sudo systemctl disable --now cups cups-browsed
echo 'blacklist usblp' | sudo tee /etc/modprobe.d/blacklist-usblp.conf
#    The plugdev change needs a fresh login to take effect — easiest:
#    `exit` the SSH session and reconnect once.

# 1. Clone (in ~/code, mirroring the Mac layout)
mkdir -p ~/code && cd ~/code
git clone <repo-url> chota-bot
cd chota-bot

# 2. Install Node deps
npm ci

# 3. Install agent-browser (the production HTML→screenshot print path needs it)
#    Skip the install steps if setup_linux.sh already did them.
npm install -g agent-browser
agent-browser install                 # downloads Chromium (~150MB, one-time)
#    No /usr/local/bin/agent-browser symlink — chota.service has the fnm bin
#    dir on PATH, so the subprocess spawn finds it directly.

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

### Phase 2 — kiosk display mode (deferred; opt-in)

**Skip this entire phase** unless the box has a dedicated kiosk display
(touchscreen wired over HDMI, etc.) and you actually want chota to launch
fullscreen on its own at boot. With Phase 1 alone the dashboard is just a
web app — open it in any browser when you want to see it.

When you do enable kiosk mode, **the commands below need a rewrite for
Pop!\_OS / GNOME** — they're currently Cinnamon (Mint) specific and will
silently no-op on Pop!\_OS. The Wayland-vs-Xorg + GDM-vs-LightDM differences
also matter. Treat this section as a TODO that lands when a kiosk display is
physically connected, not as steps to follow today.

```bash
# 9. Kiosk display — launch the dashboard fullscreen on session login
cp deploy/chota-kiosk.desktop ~/.config/autostart/
#    Then enable auto-login: Mint menu → Login Window → Users → Automatic login.
#    Reboot — the dashboard should come up fullscreen on its own. The systemd
#    service (step 7) is the server; this entry is just the browser pointed at it.

# 10. Keep the screen on — disable the Cinnamon screensaver, idle lock, and
#     AC display-sleep so the wall display never blanks. (Per-user; persists.)
gsettings set org.cinnamon.desktop.screensaver lock-enabled false
gsettings set org.cinnamon.desktop.session idle-delay 0
gsettings set org.cinnamon.settings-daemon.plugins.power sleep-display-ac 0
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
npm run deploy    # = bash deploy/push.sh  (preflight, then deploy.sh on the kiosk)
npm run logs      # = ssh chota 'sudo journalctl -u chota -f'
```

(`chota` is an SSH alias for the kiosk box — see `~/.ssh/config`.) `push.sh` is
the Mac-side wrapper that runs before `deploy.sh` on the kiosk. It does three
things:

1. **SSH preflight with auto re-auth.** Tailscale SSH does a periodic re-auth
   check that blocks the session on a "visit this URL" prompt. The preflight
   detects it, `open`s the URL in your default browser, and polls until the
   login completes (up to 5 min) — so the deploy auto-continues, no manual
   re-run.
2. **Auto-syncs `chota.config.ts` → kiosk.** The config is gitignored, so the
   kiosk doesn't get it via `git pull`. SP5 is treated as a dumb deploy target
   — edit the config here, `npm run deploy` pushes it up.
3. **Hands off to `deploy/deploy.sh` on the kiosk** for the actual pull / build
   / restart.

`.env` stays per-machine — it carries SP5-only `KIOSK=true` and the OAuth
`ORIGIN`. Edit those on the box.

The deploy script (`deploy.sh`, on the kiosk) is idempotent (re-running with no new commits is a no-op):

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

Sentral session cookies expire periodically, but you don't have to do anything — `refreshTimetable` self-heals: when the cookie's dead it logs in via agent-browser using `SENTRAL_<NAME>_EMAIL` / `_PASSWORD` and re-caches the cookie. Only touch `.env` if a kid's NSW DoE password itself changes.

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

## Reverse proxy — portless URL

The app listens on `:8000` (a non-privileged port). To reach the dashboard at
`http://sp5.local/` with **no port** — the URL the family bookmarks — Caddy runs
on `:80` and reverse-proxies to it. Caddy binds the privileged port via its own
`CAP_NET_BIND_SERVICE`; the app itself never needs root.

One-time install on the box — use the **official Caddy apt repo** (current +
auto-updating via `apt upgrade`; the Ubuntu/Mint repo copy lags badly):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

The package installs + enables `caddy.service` (survives reboots, reads
`/etc/caddy/Caddyfile`). Drop our config in and reload:

```bash
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`deploy/Caddyfile` is just `:80 { reverse_proxy localhost:8000 }` — LAN-only,
plain HTTP (the bare `:80` disables Caddy's auto-HTTPS). It's independent of
`chota.service`: if the app is down or restarting, Caddy simply 502s until it's
back. The Caddyfile isn't touched by `deploy.sh` — re-copy + reload only when
`deploy/Caddyfile` itself changes.

## Optional hardening

Not Phase 1 blockers — wire when the need shows up.

- **mDNS** — `avahi-daemon` (enabled by default on Mint) advertises the box on
  the LAN, so `sp5.local` resolves with no central DNS. Nothing to set up as
  long as the hostname is `sp5`.
- **Tailscale** — already on the box; reachable from any device on the tailnet
  at `sp5.<tailnet>.ts.net`. `tailscale serve 8000` would add a portless HTTPS
  URL over the tailnet if ever wanted.
