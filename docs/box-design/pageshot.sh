#!/bin/bash
# pageshot.sh : screenshots index.html at 1500 (dark, light) and 400 (in an iframe)
D="$(cd "$(dirname "$0")" && pwd)"; mkdir -p "$D/shots"; C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for m in dark light; do
  { echo "<!doctype html><html data-theme=\"$m\"><meta charset=utf-8>"; cat "$D/index.html"; } > "$D/shots/page-$m.html"
  "$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome-page" --window-size=1500,1500 --virtual-time-budget=3000 --screenshot="$D/shots/page-$m-1500.png" "file://$D/shots/page-$m.html" >/dev/null 2>&1
done
echo "<!doctype html><body style='margin:0;background:#888'><iframe src='page-dark.html' style='width:400px;height:2600px;border:0'></iframe><iframe src='page-light.html' style='width:400px;height:2600px;border:0;margin-left:20px'></iframe>" > "$D/shots/narrow.html"
"$C" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome-page" --window-size=840,2600 --virtual-time-budget=3000 --screenshot="$D/shots/page-400.png" "file://$D/shots/narrow.html" >/dev/null 2>&1
echo done
