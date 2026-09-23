#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
python3 build-variants.py
browser="${CHROME_BIN:-}"
if [[ -z "$browser" ]]; then
  browser="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
fi
if [[ -z "$browser" ]]; then
  echo "Set CHROME_BIN to a Chromium binary." >&2
  exit 1
fi
mkdir -p exports
for concept in overlap growth gesture; do
  "$browser" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=1500,2580 \
    --screenshot="$(pwd)/exports/$concept.png" \
    "file://$(pwd)/board.html?concept=$concept"
done
"$browser" --headless=new --no-sandbox --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1500,850 \
  --screenshot="$(pwd)/exports/comparison.png" \
  "file://$(pwd)/comparison.html"
sha256sum exports/*.png > SHA256SUMS
