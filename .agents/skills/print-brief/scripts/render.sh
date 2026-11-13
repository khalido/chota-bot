#!/bin/sh
# Render a print brief with headless Chromium.
#   render.sh path/to/brief.html
# Writes brief.pdf (vector, A4 from the page's @page rule, for the laser
# printer) and brief.png (screen preview) next to the HTML, prints the fit
# check, and exits 3 when a side overflows.
#
# Plain Chromium, not agent-browser: agent-browser's `pdf` ignores @page and
# writes US Letter. On the Pi this is /usr/bin/chromium; on the Mac,
# agent-browser's own Chrome for Testing. CHROME=/path overrides.
set -e
[ -n "$1" ] || { echo "usage: render.sh brief.html" >&2; exit 2; }
DIR=$(cd "$(dirname "$1")" && pwd)
HTML="$DIR/$(basename "$1")"
BASE="${HTML%.html}"
URL="file://$HTML"

if [ -z "$CHROME" ]; then
  for c in /usr/bin/chromium /usr/bin/chromium-browser \
    "$(ls -d "$HOME"/.agent-browser/browsers/chrome-*/"Google Chrome for Testing.app"/Contents/MacOS/"Google Chrome for Testing" 2>/dev/null | tail -1)" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    [ -x "$c" ] && { CHROME=$c; break; }
  done
fi
[ -n "$CHROME" ] || { echo "no Chromium found; set CHROME=/path/to/chrome" >&2; exit 1; }

# A4 at 96 dpi is 794×1123 px. The time budget lets the web fonts and the fit
# script settle before capture.
FLAGS="--headless=new --disable-gpu --no-sandbox --virtual-time-budget=6000 --window-size=794,1123"

"$CHROME" $FLAGS --no-pdf-header-footer --print-to-pdf="$BASE.pdf" "$URL" 2>/dev/null
"$CHROME" $FLAGS --window-size=900,2400 --hide-scrollbars --screenshot="$BASE.png" "$URL" 2>/dev/null
FIT=$("$CHROME" $FLAGS --dump-dom "$URL" 2>/dev/null | grep -o 'data-fit="[^"]*"' | head -1 | sed 's/data-fit="//; s/"$//')

echo "pdf: $BASE.pdf"
echo "png: $BASE.png"
echo "fit: ${FIT:-unknown (no fit script, or fonts never loaded)}"
# A full side is clipped silently by .page { overflow: hidden }: fail loudly.
case "$FIT" in OVERFLOW*) echo "a side overflows: cut words or a table row, don't shrink type" >&2; exit 3;; esac
