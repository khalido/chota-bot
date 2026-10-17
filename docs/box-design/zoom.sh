#!/bin/bash
# zoom.sh <name> <theme> <x> <y> <w> <h> : crop of <name>.svg at 2.5x scale -> shots/zoom-<name>-<theme>.png
D="$(cd "$(dirname "$0")" && pwd)"; N=$1; M=$2; X=$3; Y=$4; WW=$5; HH=$6
F="$D/shots/zoom-$N-$M.html"
{ echo "<!doctype html><html data-theme=\"$M\"><meta charset=\"utf-8\"><style>"; cat "$D/figure.css"; echo "body{margin:0;background:var(--panel)}svg.iso{width:100vw;height:100vh}</style>"; sed "s/viewBox=\"0 0 1300 950\"/viewBox=\"$X $Y $WW $HH\"/" "$D/$N.svg"; } > "$F"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$D/.chrome-z" --window-size=$((WW*3)),$((HH*3)) --virtual-time-budget=2000 --screenshot="$D/shots/zoom-$N-$M.png" "file://$F" >/dev/null 2>&1
echo "$D/shots/zoom-$N-$M.png"
