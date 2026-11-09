#!/usr/bin/env bash
# Download the latest Spotify Soloist build, check it runs, install it to
# ~/.local/bin/soloist and restart the user service. Safe to run any time.
# The URL is Spotify's moving "latest" build; there are no checksums to check.
set -euo pipefail

URL="https://soloist-builds.spotifycdn.com/soloist_release_arm64.tar.gz"
DEST="$HOME/.local/bin/soloist"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL --retry 3 -o "$tmp/soloist.tar.gz" "$URL"

# Extract only the executable, whatever its path in the archive.
member="$(tar -tzf "$tmp/soloist.tar.gz" | grep -E '(^|/)soloist$' | head -n1)"
if [ -z "$member" ]; then
	echo "soloist-update: no 'soloist' executable in the archive" >&2
	exit 1
fi
mkdir "$tmp/x"
tar -xzf "$tmp/soloist.tar.gz" -C "$tmp/x" "$member"
chmod +x "$tmp/x/$member"

new="$("$tmp/x/$member" --version)"
old="$("$DEST" --version 2>/dev/null || echo none)"
echo "soloist-update: installed $old, downloaded $new"

if [ "$new" = "$old" ] && systemctl --user is-active --quiet soloist; then
	echo "soloist-update: already current"
	exit 0
fi

mkdir -p "$(dirname "$DEST")"
install -m 755 "$tmp/x/$member" "$DEST.new"
mv -f "$DEST.new" "$DEST"
systemctl --user restart soloist
echo "soloist-update: now running $new"
