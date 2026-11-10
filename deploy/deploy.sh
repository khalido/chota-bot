#!/usr/bin/env bash
# Manual deploy — runs on the kiosk box. Don't invoke this directly; from your
# Mac run `bun run deploy`, which calls `deploy/push.sh` (a preflight SSH guard)
# and that hands off to this script over SSH.
#
#   bash deploy/deploy.sh          # deploy origin/main
#   bash deploy/deploy.sh <sha>    # roll back (or forward) to that commit
#
# What it does:
#   - preflight: .env, chota.config.ts and a database with tables are present
#   - check out the target: fast-forward main, or the commit given
#   - compare against data/.deployed (the commit + config that last passed the
#     health check). Nothing differs → no-op. A run that failed part-way left
#     that stamp alone, so re-running redoes every step it needs.
#   - if bun.lock differs → bun install --frozen-lockfile
#   - bun run build into build.next/ (chota.config.ts is compiled in, so a config
#     change needs it); the running build/ is untouched until the swap
#   - if schema files differ → snapshot the database, then drizzle-kit push
#   - move build/ to build.prev/, build.next/ to build/, sudo systemctl restart chota
#   - verify: systemd active, HTTP 200, the running version is this commit,
#     jobs registered. Only then write data/.deployed. If it doesn't come up and
#     no schema changed, build.prev/ is put back and restarted.
#
# Setup is documented in docs/deploy.md (first-time bootstrap, systemd unit,
# Caddy/udev/mDNS snippets).
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET="${1:-}"
STAMP=data/.deployed
BACKUPS=data/backups

# Bun lives in ~/.bun/bin, on $PATH only via the rc file in interactive shells;
# this script runs over non-TTY SSH from push.sh on the Mac, so prepend it. Same
# binary the systemd unit runs. (fnm stays on the X230 only for the global
# agent-browser; the Pi installs that with `bun add -g`.)
export PATH="$HOME/.bun/bin:$HOME/.local/share/fnm/aliases/default/bin:$PATH"

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

# The database must already hold tables. The build opens it, which creates an
# empty file when it is missing, so "the file exists" proves nothing. A box
# with no data gets bootstrap.sh (fresh schema) or a restored backup, not this.
DB_PATH="$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)"
if [ -z "$DB_PATH" ] || [ ! -f "$DB_PATH" ] \
		|| [ -z "$(sqlite3 "$DB_PATH" "SELECT 1 FROM sqlite_master WHERE type='table' AND name='user'")" ]; then
	echo "✗ No database with tables at '$DB_PATH'." >&2
	echo "  Restore a backup into it, or on a new box run: bash deploy/bootstrap.sh" >&2
	exit 1
fi

# ── Check out the target ────────────────────────────────────────────────────
BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin main
if [ -n "$TARGET" ]; then
	# A named commit: detached, so nothing moves main. The next plain deploy
	# checks main out again.
	git checkout --quiet --detach "$TARGET"
else
	git checkout --quiet main
	git pull --ff-only origin main
fi
AFTER=$(git rev-parse HEAD)

# Refresh the sibling curios repo (quotes + puzzles content). chota
# reads from ../curios/dist/* at runtime, so pulling here keeps the
# kiosk's content as current as the curios main branch. Hard-fail on
# error: internet is required for the chota git pull above anyway, so
# if curios is unreachable something larger is broken. clone-if-missing
# covers the first deploy after the data-folder → sibling-repo migration.
if [ ! -d ../curios/.git ]; then
	echo "Cloning ../curios for the first time…"
	git clone https://github.com/khalido/curios ../curios
else
	echo "Updating ../curios…"
	(cd ../curios && git fetch --quiet && git pull --ff-only)
fi
echo "  curios at $(cd ../curios && git rev-parse --short HEAD)"

# ── What changed since the last deploy that passed its checks ───────────────
# The stamp is "<commit> <sha256 of chota.config.ts>", written at the very end.
# No stamp (first run of this script): assume the commit we started on is what
# runs, and that the config may have changed.
mkdir -p data data/logs
CONFIG_HASH=$(sha256sum chota.config.ts | cut -d' ' -f1)
DEPLOYED_SHA="$BEFORE"
DEPLOYED_CONFIG=""
if [ -f "$STAMP" ]; then
	read -r DEPLOYED_SHA DEPLOYED_CONFIG < "$STAMP" || true
fi

if [ "$DEPLOYED_SHA" = "$AFTER" ] && [ "$DEPLOYED_CONFIG" = "$CONFIG_HASH" ]; then
	echo "Already at $AFTER with this chota.config.ts — nothing to deploy."
	exit 0
fi

if git cat-file -e "$DEPLOYED_SHA^{commit}" 2>/dev/null; then
	CHANGED=$(git diff --name-only "$DEPLOYED_SHA" "$AFTER")
else
	# The stamped commit is gone (a rewritten branch): redo everything.
	echo "Last deployed commit $DEPLOYED_SHA isn't in this checkout — running every step."
	CHANGED=$(printf 'bun.lock\nsrc/lib/server/db/schema.ts\n')
fi

if [ ! -f "$STAMP" ] && [ "$DEPLOYED_SHA" = "$AFTER" ]; then
	echo "No deploy stamp yet → rebuilding $AFTER"
elif [ "$DEPLOYED_SHA" = "$AFTER" ]; then
	echo "chota.config.ts changed → rebuilding $AFTER"
else
	echo "Updating $DEPLOYED_SHA → $AFTER"
fi

if echo "$CHANGED" | grep -q '^bun\.lock$'; then
	echo "bun.lock changed → bun install"
	bun install --frozen-lockfile
fi

# Build beside the running one, not over it: adapter-node empties its output
# folder first, and the live process loads its route files lazily from there. So
# a build (or a schema push) that fails leaves build/ and the running bot alone.
echo "Building…"
rm -rf build.next
BUILD_OUT=build.next bun run build
# A checkout whose vite.config.ts predates BUILD_OUT ignores it and builds in place.
SWAP=0
[ -f build.next/index.js ] && SWAP=1
SCHEMA_PUSHED=0

# Schema last, right before the restart: the old build is still serving and a
# table change can break it, so keep that window to seconds.
if echo "$CHANGED" | grep -qE '^(drizzle/|src/lib/server/db/.*\.schema\.ts$|src/lib/server/db/schema\.ts$)'; then
	if [ -n "$TARGET" ]; then
		# Going to an older commit doesn't undo a schema change, and pushing an
		# older schema can drop the newer columns and their data.
		echo "⚠ Schema files differ between $DEPLOYED_SHA and $AFTER, and this is a pinned deploy:" >&2
		echo "  the database is left as it is. If the code needs the older schema, stop chota and" >&2
		echo "  restore the matching snapshot from $BACKUPS/ (ls -t $BACKUPS)." >&2
	else
		# The only copy of the data: snapshot it first. .backup is safe on a live
		# WAL database (cp is not). Keep the last three.
		mkdir -p "$BACKUPS"
		SNAP="$BACKUPS/home-before-$(git rev-parse --short "$AFTER")-$(date +%Y%m%d-%H%M%S).db"
		sqlite3 -cmd '.timeout 5000' "$DB_PATH" ".backup '$SNAP'"
		[ "$(sqlite3 "$SNAP" 'PRAGMA integrity_check')" = "ok" ] || {
			echo "✗ Snapshot $SNAP failed its integrity check; not touching the schema." >&2
			exit 1
		}
		echo "Snapshot: $SNAP"
		ls -t "$BACKUPS"/home-before-*.db | tail -n +4 | xargs -r rm -f

		# --force: push renders an interactive review UI otherwise, which has no TTY
		# over SSH. --force auto-approves (incl. data-loss statements) — fine here
		# since schema changes are reviewed locally via `bun run db:push` first; a
		# destructive change would need that local confirmation before it ships.
		echo "drizzle schema changed → drizzle-kit push --force"
		PUSH_LOG=$(mktemp)
		PUSH_FAILED=0
		# `||`: under pipefail a non-zero exit would end the script here, before
		# the message below.
		bunx drizzle-kit push --force 2>&1 | tee "$PUSH_LOG" || PUSH_FAILED=1
		# push can print an error and still exit 0 (a change it wants to ask about
		# has no TTY to ask on), so read what it said. It always re-creates the
		# partial index chat_session_open_key, so "Changes applied" is normal.
		if [ "$PUSH_FAILED" -eq 1 ] || grep -q '^Error' "$PUSH_LOG" \
				|| ! grep -qE 'Changes applied|No changes detected' "$PUSH_LOG"; then
			rm -f "$PUSH_LOG"
			echo "✗ drizzle-kit push did not finish. chota was NOT restarted." >&2
			if [ "$SWAP" -eq 1 ]; then
				echo "  build/ is still the old code, so the bot keeps running as it was." >&2
			else
				echo "  build/ is already the new code, so fix this before any restart." >&2
			fi
			echo "  The schema may be part-changed. Snapshot to restore from: $SNAP" >&2
			exit 1
		fi
		rm -f "$PUSH_LOG"
		SCHEMA_PUSHED=1
	fi
fi

# Swap and restart back to back: once build/ moves, the old process can no
# longer load a route it hasn't loaded yet.
if [ "$SWAP" -eq 1 ]; then
	if [ -f build/.unhealthy ]; then
		# The build in place failed its check last time and wasn't put back (a
		# schema change). build.prev is still the last good one: keep it.
		rm -rf build
	else
		rm -rf build.prev
		[ -d build ] && mv build build.prev
	fi
	mv build.next build
fi
echo "Restarting chota.service…"
sudo systemctl restart chota

# Verify the whole boot path landed:
#   1. systemd active — process is up
#   2. /api/health answers — adapter-node bound the port and is serving
#   3. it reports this commit — it's this build, not the old one
#   4. journal shows the job-boot banner — every cron job got registered (soft)
# Boot takes ~2s + ~3s warm-up on first request, so poll up to 15s.
# /api/health, not /: the dashboard's load waits on weather, calendar, lists
# and buses, and a slow one of those must not fail a good build.
HEALTH='http://localhost:8000/api/health?format=json'
# healthy <short sha>: active, answering, and built from that commit.
healthy() {
	local want="$1" i running
	for i in $(seq 1 20); do
		if systemctl is-active --quiet chota && running=$(curl -fsS -m 3 "$HEALTH" 2>/dev/null); then
			echo "✓ answering after ${i}s"
			if echo "$running" | grep -q "\"version\":\"$want\""; then
				echo "✓ running $want"
				return 0
			fi
			echo "✗ chota answers, but its version isn't $want: $(echo "$running" | head -c 200)" >&2
			return 1
		fi
		sleep 1
	done
	echo "✗ chota didn't answer on :8000 within 20s (journalctl -u chota -n 30 --no-pager)" >&2
	return 1
}

if ! healthy "$(git rev-parse --short HEAD)"; then
	# Put the previous build back when that is safe: it was moved aside by this
	# run, and the database is as that build knows it.
	if [ "$SWAP" -eq 1 ] && [ -d build.prev ] && [ "$SCHEMA_PUSHED" -eq 0 ]; then
		rm -rf build.failed
		mv build build.failed
		mv build.prev build
		sudo systemctl restart chota
		echo "↩ Put the previous build back and restarted. The failed one is in build.failed/." >&2
		if echo "$CHANGED" | grep -q '^bun\.lock$'; then
			echo "⚠ bun.lock changed in this run, so the previous build is running on the NEW node_modules." >&2
			echo "  If it misbehaves: git checkout $DEPLOYED_SHA -- bun.lock && bun install --frozen-lockfile, then restart." >&2
		fi
		if healthy "$(git rev-parse --short "$DEPLOYED_SHA" 2>/dev/null || echo unknown)"; then
			echo "  The previous build is up." >&2
		else
			echo "✗ The previous build did NOT come back up either. The bot is down: look at the journal now." >&2
		fi
	elif [ "$SCHEMA_PUSHED" -eq 1 ]; then
		touch build/.unhealthy 2>/dev/null || true
		echo "  The schema was changed in this run, so the previous build (build.prev/) was NOT put back:" >&2
		echo "  it may not work on the new schema. Fix forward, or restore the snapshot in $BACKUPS/ and" >&2
		echo "  then: mv build build.failed && mv build.prev build && sudo systemctl restart chota" >&2
	fi
	exit 1
fi

if ! journalctl -u chota --since "1 min ago" --no-pager 2>/dev/null \
		| grep -qE "chota·jobs boot — [0-9]+ job\(s\) registered"; then
	echo "⚠ HTTP 200 but no job-boot banner in the last minute — a job may have failed to register:" >&2
	echo "  journalctl -u chota -n 50 --no-pager" >&2
	# Don't exit — the app is serving, this is a soft warning. Failing jobs are
	# logged with ERR and won't take down the dashboard.
fi

echo "$AFTER $CONFIG_HASH" > "$STAMP"
echo "✓ Deployed $AFTER"
