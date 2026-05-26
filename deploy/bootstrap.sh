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
#   2. apt prereqs: sqlite3
#   3. plugdev membership for $USER (re-login takes effect)
#   4. CUPS off (service + socket + path) + usblp blacklisted — printer claim defence
#   5. sudoers entry for unattended `npm run deploy`
#   6. udev rule for the MUNBYN printer
#   7. Preflight: required files exist (.env, chota.config.ts)
#   8. npm ci — Node deps
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
say "Step 2/9 — apt prereqs (sqlite3)"
if have_pkg sqlite3; then
	echo "✓ sqlite3 already installed"
else
	sudo apt-get update -qq
	sudo apt-get install -y sqlite3
fi

# ── 3. plugdev membership ──────────────────────────────────────────────────
say "Step 3/9 — plugdev membership for $USER"
if id -nG "$USER" | tr ' ' '\n' | grep -qx plugdev; then
	echo "✓ $USER already in plugdev"
else
	sudo usermod -aG plugdev "$USER"
	echo "✓ Added $USER to plugdev — will take effect on next login (exit + re-ssh)."
fi

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
	printf '\n# kiosk-only overrides (appended by bootstrap.sh)\nPORT=8000\nKIOSK="true"\n' >> .env
	echo "✓ Appended PORT + KIOSK to .env"
fi

# Clone the sibling content repo (curios) for quotes + puzzles. chota
# reads from ../curios/dist/* at runtime; deploy.sh keeps it current
# with `git pull` on every deploy.
if [ ! -d ../curios/.git ]; then
	say "Cloning curios alongside chota-bot (content for quotes + puzzles)"
	git clone https://github.com/khalido/curios ../curios
fi
echo "✓ ../curios/ at $(cd ../curios && git rev-parse --short HEAD)"

# ── 8. npm ci ──────────────────────────────────────────────────────────────
say "Step 8/9 — npm ci"
if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
	echo "✓ node_modules already installed (skip; re-run with rm -rf node_modules to force)"
else
	# fnm puts node on $PATH only in interactive shells; bootstrap.sh runs under
	# bash but via `bash deploy/bootstrap.sh`, which may or may not source the
	# rc file. Source the fnm bin dir explicitly to be safe.
	export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
	npm ci
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
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"
echo "Building…"
npm run build
mkdir -p data data/logs
DB_PATH="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
if [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
	echo "Fresh DB ($DB_PATH) → generating + applying schema"
	npx drizzle-kit generate
	cat drizzle/*.sql | sqlite3 "$DB_PATH"
fi
sudo systemctl restart chota
sleep 3

say "Bootstrap complete."
sudo systemctl is-active chota
curl -fsS -o /dev/null -m 5 http://localhost:8000/ && echo "✓ HTTP 200 on localhost:8000"
echo
echo "Next:"
echo "  - Open http://$(hostname):8000/ from another machine on the tailnet"
echo "  - Sign in with Google at /admin to wire up the calendar tool"
echo "  - From the Mac, future updates are just: npm run deploy"
