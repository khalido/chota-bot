#!/usr/bin/env bash
# Deploy to the kiosk from your Mac — this is what `bun run deploy` runs.
#
# Reaching the box needs Tailscale, which has TWO independent gates — so we
# check them separately and print a clear, actionable message for each:
#   1. Is this Mac on the tailnet at all?  (`tailscale status`) — if it's
#      stopped/logged out, no `chota` hostname resolves. Fix: `tailscale up`.
#   2. Is Tailscale *SSH* still authenticated?  This is a periodic re-auth
#      check that expires faster than the tunnel; when due, ssh prints
#      "To authenticate, visit <URL>". We open it and wait a short window,
#      continuing automatically once you approve.
# Then: scp the gitignored chota.config.ts (the box is a dumb deploy target —
# .env stays per-machine), and hand off to the kiosk-side deploy/deploy.sh
# (pull, build, restart) over SSH.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=chota
PREFLIGHT_TIMEOUT=15
AUTH_WAIT_SECONDS=120

# The Tailscale CLI: on PATH normally, else the macOS app bundle.
TS=$(command -v tailscale || echo /Applications/Tailscale.app/Contents/MacOS/Tailscale)

# ── Check 1: is this Mac connected to the tailnet? ──────────────────────────
check_tailnet() {
	[ -x "$TS" ] || return 0 # no CLI to ask — let the SSH probe be the judge
	local out="" rc=0
	out=$("$TS" status 2>&1) || rc=$?
	[ "$rc" -eq 0 ] && return 0
	echo "✗ This Mac isn't connected to Tailscale — the kiosk is unreachable." >&2
	if printf '%s' "$out" | grep -qi 'logged out'; then
		echo "  You're logged out. Run:  tailscale login" >&2
	else
		echo "  Bring it up. Run:  tailscale up" >&2
	fi
	echo "  …then re-run 'bun run deploy'." >&2
	return 1
}

# Portable timeout (macOS ships no `timeout`): perl's alarm SIGALRMs the exec'd
# ssh after N seconds. Healthy connection returns in ~1s.
preflight() {
	perl -e 'alarm shift; exec @ARGV' "$PREFLIGHT_TIMEOUT" \
		ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>&1
}

# ── Check 2: is Tailscale SSH authenticated? (expires faster than the tunnel) ─
ensure_ssh() {
	local out
	if out=$(preflight); then
		echo "Preflight OK."
		return 0
	fi
	if ! printf '%s' "$out" | grep -q 'To authenticate, visit'; then
		[ -n "$out" ] && echo "$out" >&2
		echo "✗ Tailscale's up, but can't SSH to '$HOST' — the box may be offline." >&2
		echo "  Check:  tailscale status | grep pop-os" >&2
		return 1
	fi
	local url
	url=$(printf '%s' "$out" | grep -oE 'https://login\.tailscale\.com/[a-zA-Z0-9_/-]+' | head -1)
	echo "→ Tailscale SSH needs re-authentication (this expires faster than the tunnel)." >&2
	if [ -n "$url" ] && command -v open >/dev/null 2>&1; then
		echo "  Opened your browser — approve it there.  ($url)" >&2
		open "$url" 2>/dev/null || true
	else
		echo "  Approve in your browser: ${url:-<re-run to get the link>}" >&2
	fi
	echo "  Waiting up to ${AUTH_WAIT_SECONDS}s, then continuing automatically…" >&2
	local deadline=$((SECONDS + AUTH_WAIT_SECONDS))
	while [ "$SECONDS" -lt "$deadline" ]; do
		sleep 3
		if preflight >/dev/null 2>&1; then
			echo "✓ Authenticated — continuing." >&2
			return 0
		fi
	done
	echo "✗ Not authenticated within ${AUTH_WAIT_SECONDS}s — approve the page, then re-run 'bun run deploy'." >&2
	return 1
}

# `bun run deploy <sha>` pins the box to that commit (a rollback).
TARGET="${1:-}"
if [ -n "$TARGET" ] && ! [[ "$TARGET" =~ ^[0-9a-f]{7,40}$ ]]; then
	echo "✗ '$TARGET' isn't a commit sha. Usage: bun run deploy [<sha>]" >&2
	exit 1
fi

check_tailnet
ensure_ssh

# deploy.sh pulls origin/main on the box. Say so when that isn't what's checked
# out here, so "deployed" is never read as "my working copy is live".
if [ -z "$TARGET" ]; then
	git fetch --quiet origin main || echo "⚠ couldn't fetch origin/main; comparing against the last fetch" >&2
	REMOTE=$(git rev-parse --short origin/main)
	LOCAL=$(git rev-parse --short HEAD)
	DIRTY=""
	[ -n "$(git status --porcelain --untracked-files=no)" ] && DIRTY=" with uncommitted changes"
	if [ "$LOCAL" != "$REMOTE" ] || [ -n "$DIRTY" ]; then
		echo "⚠ Deploying origin/main ($REMOTE). This checkout is $(git branch --show-current) at $LOCAL$DIRTY;"
		echo "  none of that ships until it is pushed to main. chota.config.ts does ship."
	fi
fi

echo "Syncing chota.config.ts → ${HOST}..."
scp -q chota.config.ts "$HOST":~/code/chota-bot/chota.config.ts

ssh "$HOST" "cd ~/code/chota-bot && bash deploy/deploy.sh $TARGET"
