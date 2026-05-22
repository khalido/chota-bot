#!/usr/bin/env bash
# Manual deploy — runs on the kiosk box. Don't invoke this directly; from your
# Mac run `npm run deploy`, which calls `deploy/push.sh` (a preflight SSH guard)
# and that hands off to this script over SSH.
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

# Fresh-box DB init: if the sqlite file doesn't exist, generate the schema
# from drizzle and apply it directly (drizzle-kit push needs a TTY). Subsequent
# schema changes go through the `npx drizzle-kit push` step above. Requires
# sqlite3 in PATH — see docs/deploy.md bootstrap.
DB_PATH="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
if [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
	echo "Fresh DB ($DB_PATH) → generating + applying schema"
	npx drizzle-kit generate
	cat drizzle/*.sql | sqlite3 "$DB_PATH"
fi

echo "Restarting chota.service…"
sudo systemctl restart chota
sleep 2

# Verify both that systemd considers it active AND that it's actually serving
# HTTP — `is-active` only checks the process is running, not that the app booted
# past its job-registration phase or bound the port.
sudo systemctl is-active chota
if ! curl -fsS -o /dev/null -m 5 http://localhost:8000/; then
	echo "Service is active but HTTP check failed — investigate:" >&2
	echo "  sudo journalctl -u chota -n 30 --no-pager" >&2
	exit 1
fi

echo "Deployed $AFTER."
