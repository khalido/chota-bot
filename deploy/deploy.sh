#!/usr/bin/env bash
# Manual deploy — runs on the kiosk box. Don't invoke this directly; from your
# Mac run `npm run deploy`, which calls `deploy/push.sh` (a preflight SSH guard)
# and that hands off to this script over SSH.
#
# What it does (idempotent — re-runnable, no-op when there's nothing new):
#   - preflight: verify .env, chota.config.ts, and the sqlite DB are present
#   - git fetch + fast-forward pull from origin/main (fails on conflict)
#   - if package-lock.json changed → npm ci
#   - if drizzle/schema files changed → npx drizzle-kit push (apply migrations)
#   - npm run build (always)
#   - mkdir -p the runtime data subdirs (in case it's a fresh box)
#   - sudo systemctl restart chota
#   - verify health: systemd active + HTTP 200 + jobs registered
#
# Setup is documented in docs/deploy.md (first-time bootstrap, systemd unit,
# Caddy/udev/mDNS snippets). For a rollback: git checkout <prev-sha> && rerun.
set -euo pipefail
cd "$(dirname "$0")/.."

# fnm puts node/npm/npx on $PATH only via the rc-file init in interactive
# shells; this script runs over non-TTY SSH from push.sh on the Mac, so we
# prepend fnm's default-alias bin dir explicitly. Same path the systemd unit
# resolves through, so npm version + node version are guaranteed to match.
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$PATH"

# ── Preflight: fail loudly if a required file is missing ────────────────────
# A fresh-box deploy that's missing one of these would produce cryptic errors
# minutes deeper into the script (env parse errors, ESM resolution failures,
# better-auth migration crashes). Catching it here saves the round-trip.
preflight_fail=0
for f in .env chota.config.ts; do
	if [ ! -f "$f" ]; then
		echo "✗ Missing $(pwd)/$f — copy it from your Mac before re-running." >&2
		preflight_fail=1
	fi
done
if [ "$preflight_fail" -ne 0 ]; then
	echo >&2
	echo "First-time bootstrap? Run:" >&2
	echo "  scp .env chota.config.ts chota:~/code/chota-bot/    # from your Mac" >&2
	echo "See docs/deploy.md Phase 1." >&2
	exit 1
fi

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
	echo "╭─ Fresh box detected: no DB at $DB_PATH"
	echo "│  Generating schema from src/lib/server/db/auth.schema.ts…"
	npx drizzle-kit generate
	echo "│  Applying SQL to $DB_PATH…"
	cat drizzle/*.sql | sqlite3 "$DB_PATH"
	echo "╰─ DB ready: $(sqlite3 "$DB_PATH" '.tables' | tr -s ' \n' ', ' | sed 's/,$//')"
fi

echo "Restarting chota.service…"
sudo systemctl restart chota
sleep 2

# Verify the whole boot path landed:
#   1. systemd active — process is up
#   2. HTTP 200 on / — adapter-node bound the port and is serving
#   3. journal shows the job-boot banner — every cron job got registered
# `is-active` alone catches "process is running" but misses partial boots
# where one job throws on init and the app limps along without it.
sudo systemctl is-active chota
if ! curl -fsS -o /dev/null -m 5 http://localhost:8000/; then
	echo "Service is active but HTTP check failed — investigate:" >&2
	echo "  journalctl -u chota -n 30 --no-pager" >&2
	exit 1
fi
if ! journalctl -u chota --since "1 min ago" --no-pager 2>/dev/null \
		| grep -qE "chota·jobs boot — [0-9]+ job\(s\) registered"; then
	echo "⚠ HTTP 200 but no job-boot banner in the last minute — a job may have failed to register:" >&2
	echo "  journalctl -u chota -n 50 --no-pager" >&2
	# Don't exit — the app is serving, this is a soft warning. Failing jobs are
	# logged with ERR and won't take down the dashboard.
fi

echo "✓ Deployed $AFTER"
