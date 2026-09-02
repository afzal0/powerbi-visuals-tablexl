#!/usr/bin/env bash
# Captures the AppSource screenshots from marketing/shot.html.
# AppSource requires PNG, exactly 1366x768, no larger than 1024 KB.
set -euo pipefail
cd "$(dirname "$0")/.."
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="marketing/screenshots"
mkdir -p "$OUT"

names=(01-overview 02-filter-menu 03-sort-and-cross-filter 04-export 05-formatting)
for i in 1 2 3 4 5; do
  name="${names[$((i-1))]}"
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=4000 --window-size=1366,768 \
    --screenshot="$PWD/$OUT/$name.png" \
    "file://$PWD/marketing/shot.html?scene=$i" >/dev/null 2>&1
done
