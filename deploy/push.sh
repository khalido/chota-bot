#!/usr/bin/env bash
# Deploy to the kiosk from your Mac — this is what `npm run deploy` runs.
#
# It's a thin wrapper around the kiosk-side `deploy/deploy.sh`: it runs a timed
# preflight SSH check first, then hands off to the real deploy.
#
# Why the preflight: Tailscale SSH does a periodic re-auth check. When that's
# due it prints a "To authenticate, visit <URL>" prompt and blocks the SSH
# session until you click it. Without this guard the real deploy hangs there
# mid-run. The preflight surfaces it up front — it times out fast, prints the
# auth URL, and tells you to re-run once authenticated.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST=chota
PREFLIGHT_TIMEOUT=25

echo "Preflight: checking ssh ${HOST}..."
# perl's alarm is a portable timeout (macOS ships no `timeout`): it SIGALRMs the
# exec'd ssh after N seconds. A healthy connection returns in ~1s; a Tailscale
# re-auth prompt blocks until the alarm kills it.
if out=$(perl -e 'alarm shift; exec @ARGV' "$PREFLIGHT_TIMEOUT" \
	ssh -o BatchMode=yes -o ConnectTimeout=10 "$HOST" true 2>&1); then
	echo "Preflight OK."
else
	[ -n "$out" ] && echo "$out"
	echo
	if printf '%s' "$out" | grep -q 'To authenticate, visit'; then
		echo "✗ Tailscale SSH needs re-authentication." >&2
		echo "  Open the URL above, then re-run:  npm run deploy" >&2
	else
		echo "✗ Couldn't reach '$HOST' over SSH within ${PREFLIGHT_TIMEOUT}s." >&2
		echo "  Check the kiosk is online:  tailscale status" >&2
	fi
	exit 1
fi

ssh "$HOST" 'cd ~/code/chota-bot && bash deploy/deploy.sh'
