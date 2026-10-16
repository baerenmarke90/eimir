#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 build-assets.py
browser="${CHROME_BIN:-$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)}"
if [[ -z "$browser" ]]; then echo 'Set CHROME_BIN to a Chromium binary.' >&2; exit 1; fi
mkdir -p exports
for spec in identity:1800 icons:1850 screens-light:1490 screens-dark:1490 palette:1400; do
  name="${spec%%:*}"; height="${spec##*:}"
  case "$name" in
    screens-light) query='board=screens&mode=light';;
    screens-dark) query='board=screens&mode=dark';;
    *) query="board=$name";;
  esac
  "$browser" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="1500,$height" \
    --screenshot="$(pwd)/exports/$name.png" "file://$(pwd)/boards.html?$query"
done
sha256sum exports/*.png > SHA256SUMS
