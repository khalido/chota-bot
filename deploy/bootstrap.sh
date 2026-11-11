#!/usr/bin/env bash
# Phase 1 bootstrap — runs ONCE on a fresh kiosk box after the repo is cloned
# and `.env` + `chota.config.ts` are scp'd over from the Mac. Brings the host
# from "fresh Pop!_OS / Ubuntu 24.04" to "chota running as a systemd service."
#
# Status: written from the manual deploy walkthrough on the X230 (May 2026).
# UNTESTED end-to-end on a true fresh box — validate on the next install.
#
# Idempotent: re-running detects already-done state and skips. Targets
# Pop!_OS / Ubuntu 24.04 specifically — not portable.
#
# Order of operations:
#   1. Sudo cache warm-up (one password prompt for the whole run)
#   2. apt prereqs: sqlite3, avahi-utils, pipewire-audio, ffmpeg
#   3. plugdev + audio groups for $USER, PipeWire as user services from boot
#   4. CUPS off (service + socket + path) + usblp blacklisted — printer claim defence
#   5. sudoers entry for unattended `bun run deploy`
#   6. udev rule for the MUNBYN printer
#   7. Preflight: required files exist (.env, chota.config.ts)
#   8. Bun + bun install
#   9. Hand off to deploy.sh — build, DB bootstrap, systemd install, health check
#
# Usage on a fresh box (after `git clone ... ~/code/chota-bot`):
#     scp .env chota.config.ts chota:~/code/chota-bot/    # from the Mac
#     ssh chota
#     cd ~/code/chota-bot
#     bash deploy/bootstrap.sh
set -euo pipefail

# Run from the repo root, no matter where the script lives.
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
have_pkg() { dpkg -s "$1" >/dev/null 2>&1; }

# ── 1. Sudo cache warm-up ──────────────────────────────────────────────────
# Prompt for the password once; the cache covers all sudo calls below.
say "Bootstrap will use sudo for several steps — entering password once now."
sudo -v

# ── 2. apt prereqs ─────────────────────────────────────────────────────────
# avahi-utils: @khalido/home finds Cast devices and printers with avahi-browse.
# pipewire-audio: the box's sound server (docs/audio.md).
# ffmpeg: speech clips as MP3 for the Google speakers, and pace changes.
say "Step 2/9 — apt prereqs (sqlite3, avahi-utils, pipewire-audio, ffmpeg)"
apt_pkgs=()
for p in sqlite3 avahi-utils pipewire-audio ffmpeg; do
	have_pkg "$p" || apt_pkgs+=("$p")
done
if [ "${#apt_pkgs[@]}" -eq 0 ]; then
	echo "✓ apt prereqs already installed"
else
	sudo apt-get update -qq
	sudo apt-get install -y "${apt_pkgs[@]}"
fi

# ── 3. Groups + sound ──────────────────────────────────────────────────────
say "Step 3/9 — plugdev + audio groups, PipeWire from boot"
# A lingered session has no seat, so without `audio` WirePlumber sees no cards.
for g in plugdev audio; do
	if id -nG "$USER" | tr ' ' '\n' | grep -qx "$g"; then
		echo "✓ $USER already in $g"
	else
		sudo usermod -aG "$g" "$USER"
		echo "✓ Added $USER to $g — takes effect on next login; reboot once for sound."
	fi
done
# Linger: $USER's services (PipeWire, Soloist) run from boot with nobody logged in.
sudo loginctl enable-linger "$USER"
XDG_RUNTIME_DIR="/run/user/$(id -u)" systemctl --user enable --now pipewire pipewire-pulse wireplumber
echo "✓ PipeWire enabled as user services"

# ── 4. CUPS + usblp off ────────────────────────────────────────────────────
say "Step 4/9 — disable CUPS + blacklist usblp (so neither claims the MUNBYN)"
sudo systemctl disable --now cups cups-browsed cups.socket cups.path 2>/dev/null || true
echo "✓ CUPS units disabled"
if [ -f /etc/modprobe.d/blacklist-usblp.conf ]; then
	echo "✓ usblp already blacklisted"
else
	echo 'blacklist usblp' | sudo tee /etc/modprobe.d/blacklist-usblp.conf >/dev/null
	echo "✓ Wrote /etc/modprobe.d/blacklist-usblp.conf"
fi

# ── 5. Sudoers entry ───────────────────────────────────────────────────────
say "Step 5/9 — sudoers entry for unattended deploys"
sudo install -m 0440 -o root -g root deploy/chota-deploy.sudoers /etc/sudoers.d/chota-deploy
sudo visudo -cf /etc/sudoers.d/chota-deploy
echo "✓ /etc/sudoers.d/chota-deploy installed + validated"

# ── 6. udev rule ───────────────────────────────────────────────────────────
say "Step 6/9 — udev rule for the MUNBYN"
sudo install -m 0644 deploy/99-munbyn-printer.rules /etc/udev/rules.d/99-munbyn-printer.rules
sudo udevadm control --reload-rules
sudo udevadm trigger --attr-match=idVendor=0483 || true   # no-op if no printer attached
echo "✓ udev rule installed + reloaded"

# ── 7. Preflight: secrets present ──────────────────────────────────────────
say "Step 7/9 — preflight: secrets present"
missing=0
for f in .env chota.config.ts; do
	[ -f "$f" ] || { echo "✗ Missing $(pwd)/$f"; missing=1; }
done
if [ "$missing" -ne 0 ]; then
	echo
	echo "Copy them over from your Mac first:" >&2
	echo "  scp .env chota.config.ts chota:~/code/chota-bot/" >&2
	exit 1
fi
echo "✓ .env + chota.config.ts present"

# Append the kiosk-only env lines once. Idempotent: only adds if absent.
if ! grep -q '^PORT=' .env; then
	printf '\n# kiosk-only overrides (appended by bootstrap.sh)\nPORT=8000\nKIOSK="true"\nPROTOCOL_HEADER=x-forwarded-proto\nHOST=127.0.0.1\n' >> .env
	echo "✓ Appended PORT, KIOSK, PROTOCOL_HEADER and HOST to .env"
fi

# Clone the sibling content repo (curios) for quotes + puzzles. chota
# reads from ../curios/dist/* at runtime; deploy.sh keeps it current
# with `git pull` on every deploy.
if [ ! -d ../curios/.git ]; then
	say "Cloning curios alongside chota-bot (content for quotes + puzzles)"
	git clone https://github.com/khalido/curios ../curios
fi
echo "✓ ../curios/ at $(cd ../curios && git rev-parse --short HEAD)"

# ── 8. Bun + bun install ───────────────────────────────────────────────────
say "Step 8/9 — Bun + bun install"
# Bun lives in ~/.bun/bin, on $PATH only via the rc file; set it explicitly.
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v bun >/dev/null; then
	curl -fsSL https://bun.sh/install | bash
fi
# No Node on the box: global CLIs with a node shebang (agent-browser) run on
# Bun through this symlink. Skip where a real node exists (the X230's fnm).
if ! command -v node >/dev/null; then
	ln -sf "$HOME/.bun/bin/bun" "$HOME/.bun/bin/node"
fi
bun install --frozen-lockfile

# agent-browser screenshots the print sheets and runs the Sentral login.
# Chrome for Testing has no linux-arm64 build, so the Pi uses the OS Chromium.
command -v agent-browser >/dev/null || bun add -g agent-browser
if [ "$(uname -m)" = aarch64 ]; then
	have_pkg chromium || sudo apt-get install -y chromium
	grep -q '^AGENT_BROWSER_EXECUTABLE_PATH=' .env \
		|| echo 'AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium' >>.env
else
	agent-browser install
fi

# ── 9. Hand off to deploy.sh ──────────────────────────────────────────────
say "Step 9/9 — deploy.sh handles build, DB bootstrap, systemd install + health check"
# deploy.sh expects the chota.service unit installed already; install it now if
# this is truly a fresh box (idempotent: -f compares content via cmp).
if [ ! -f /etc/systemd/system/chota.service ] \
	|| ! sudo cmp -s deploy/chota.service /etc/systemd/system/chota.service; then
	sudo install -m 0644 deploy/chota.service /etc/systemd/system/chota.service
	sudo systemctl daemon-reload
	echo "✓ chota.service unit installed + daemon-reloaded"
fi
sudo systemctl enable chota >/dev/null 2>&1

# deploy.sh does the rest — but it bails on "Already at $SHA". On a fresh box
# BEFORE = AFTER so we'd skip the build. Force a build path by calling the
# build + DB-bootstrap + restart inline instead. (When deploy.sh evolves a
# `--force` flag, switch to that.)
#
# The DB comes before the build: the build opens it, so it fails with no data/,
# and otherwise leaves an empty home.db that would make this check skip the schema.
mkdir -p data data/logs
DB_PATH="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
if [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
	echo "Fresh DB ($DB_PATH) → generating + applying schema"
	bunx drizzle-kit generate
	cat drizzle/*.sql | sqlite3 "$DB_PATH"
fi
echo "Building…"
bun run build
sudo systemctl restart chota
sleep 3

say "Bootstrap complete."
sudo systemctl is-active chota
curl -fsS -o /dev/null -m 5 http://localhost:8000/ && echo "✓ HTTP 200 on localhost:8000"
echo
echo "Next:"
echo "  - Open http://$(hostname)/ from another machine on the tailnet (Caddy; port 8000 is closed to the network)"
echo "  - Sign in with Google at /admin to wire up the calendar tool"
echo "  - From the Mac, future updates are just: bun run deploy"
echo "  - With the speaker plugged in: wpctl status, then wpctl set-default <id>"
