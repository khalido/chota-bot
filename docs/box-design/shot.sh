#!/bin/bash
# Usage: shot.sh <name> [width]
# Renders <name>.svg in a preview page and screenshots it in dark and light with headless Chrome.
# Writes shots/<name>-dark.png and shots/<name>-light.png (default width 1300; try 420 for phone).
# Needs to run outside the Bash sandbox (dangerouslyDisableSandbox: true).
set -e
D="$(cd "$(dirname "$0")" && pwd)"
N="$1"; W="${2:-1300}"
mkdir -p "$D/shots"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for m in dark light; do
  F="$D/shots/preview-$N-$m.html"
  {
    echo "<!doctype html><html data-theme=\"$m\"><meta charset=\"utf-8\"><title>preview</title>"
    echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">'
    echo '<style>'; cat "$D/figure.css"; echo 'body{margin:0;background:var(--bg);padding:16px} .card{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:8px}</style>'
    echo '<div class="card">'; cat "$D/$N.svg"; echo '</div>'
  } > "$F"
  H=$(( W * 3 / 4 + 80 ))
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome-$N" \
    --window-size=$W,$H --virtual-time-budget=3000 --screenshot="$D/shots/$N-$m-$W.png" "file://$F" >/dev/null 2>&1
done
echo "wrote $D/shots/$N-dark-$W.png $D/shots/$N-light-$W.png"
