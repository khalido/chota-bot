#!/usr/bin/env bash
# Deploy to the kiosk from your Mac — this is what `npm run deploy` runs.
#
# Three things happen here, in order:
#   1. SSH preflight — Tailscale SSH does a periodic re-auth check; when that's
#      due it prints "To authenticate, visit <URL>" and blocks the session.
#      We detect that, `open` the URL in your browser, then poll until the auth
#      goes through and continue automatically (no manual re-run).
#   2. `scp chota.config.ts` — the config is gitignored, so SP5 doesn't get it
#      via git pull. Treating SP5 as a dumb deploy target: any change you make
#      here gets pushed up on every deploy. (.env stays per-machine — it holds
#      SP5-only KIOSK / ORIGIN bits.)
#   3. Hand off to the kiosk-side `deploy/deploy.sh` over SSH for the real work
#      (pull, build, restart).
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=chota
PREFLIGHT_TIMEOUT=15
AUTH_WAIT_SECONDS=300

# Portable timeout (macOS ships no `timeout`): perl's alarm SIGALRMs the exec'd
# ssh after N seconds. Healthy connection returns in ~1s; a Tailscale re-auth
# prompt blocks until the alarm kills it.
preflight() {
	perl -e 'alarm shift; exec @ARGV' "$PREFLIGHT_TIMEOUT" \
		ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>&1
}

ensure_ssh() {
	local out
	if out=$(preflight); then
		echo "Preflight OK."
		return 0
	fi
	if ! printf '%s' "$out" | grep -q 'To authenticate, visit'; then
		[ -n "$out" ] && echo "$out"
		echo
		echo "✗ Couldn't reach '$HOST' over SSH within ${PREFLIGHT_TIMEOUT}s." >&2
		echo "  Check the kiosk is online:  tailscale status" >&2
		return 1
	fi
	local url
	url=$(printf '%s' "$out" | grep -oE 'https://login\.tailscale\.com/[a-zA-Z0-9_/-]+' | head -1)
	echo "Tailscale SSH needs re-authentication."
	if [ -n "$url" ] && command -v open >/dev/null 2>&1; then
		echo "Opening: $url"
		open "$url" 2>/dev/null || true
	else
		echo "Open this in your browser: ${url:-<URL not captured — re-run to see it>}"
	fi
	echo "Waiting up to ${AUTH_WAIT_SECONDS}s for the login to complete..."
	local elapsed=0
	while [ "$elapsed" -lt "$AUTH_WAIT_SECONDS" ]; do
		sleep 4
		elapsed=$((elapsed + 4))
		if preflight >/dev/null 2>&1; then
			echo "Authenticated — continuing."
			return 0
		fi
	done
	echo "✗ Auth not completed within ${AUTH_WAIT_SECONDS}s — re-run 'npm run deploy' once done." >&2
	return 1
}

ensure_ssh

echo "Syncing chota.config.ts → ${HOST}..."
scp -q chota.config.ts "$HOST":~/code/chota-bot/chota.config.ts

ssh "$HOST" 'cd ~/code/chota-bot && bash deploy/deploy.sh'
