#!/usr/bin/env bash
# Manual deploy on the kiosk box. Run from your Mac:
#
#   ssh chota 'cd ~/code/chota-bot && bash deploy/deploy.sh'
#
# What it does (idempotent — re-runnable, no-op when there's nothing new):
#   - git fetch + fast-forward pull from origin/main (fails on conflict)
#   - if package-lock.json changed → npm ci
#   - if drizzle/schema files changed → npx drizzle-kit push (apply migrations)
#   - npm run build (always)
#   - mkdir -p the runtime data subdirs (in case it's a fresh box)
#   - sudo systemctl restart chota
#
# Setup is documented in docs/deploy.md (first-time bootstrap, systemd unit,
# Caddy/udev/mDNS snippets). For a rollback: git checkout <prev-sha> && rerun.
set -euo pipefail
cd "$(dirname "$0")/.."

BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin main
git pull --ff-only origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
	echo "Already at $AFTER — nothing to deploy."
	exit 0
fi

echo "Updating $BEFORE → $AFTER"
CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")

if echo "$CHANGED" | grep -q '^package-lock\.json$'; then
	echo "package-lock.json changed → npm ci"
	npm ci
fi

if echo "$CHANGED" | grep -qE '^(drizzle/|src/lib/server/db/auth\.schema\.ts$)'; then
	echo "drizzle schema changed → drizzle-kit push"
	npx drizzle-kit push
fi

echo "Building…"
npm run build

# Runtime data dir — tool-specific subdirs (data/sentral/, data/morning/, etc.)
# are created on demand by the writing code. data/logs/ is pre-created for
# LogTape's rotating sink. Quotes are committed in data/quotes/.
mkdir -p data data/logs

echo "Restarting chota.service…"
sudo systemctl restart chota
sleep 1
sudo systemctl is-active chota

echo "Deployed $AFTER."
