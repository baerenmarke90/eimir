#!/usr/bin/env bash
# Synthetic codec fixtures only; no private recording enters the test APK.
set -euo pipefail
cd "$(dirname "$0")/.."
destination=android/app/src/androidTest/assets/video-preparation
mkdir -p "$destination"
cp backend/tests/fixtures/media/video-with-metadata.mp4 "$destination/"
cp backend/tests/fixtures/media/hlg-highlight-steps.mp4 "$destination/"
cp backend/tests/fixtures/media/pq-highlight-steps.mp4 "$destination/"
ffmpeg -hide_banner -loglevel error -nostdin -y -filter_threads 1 \
  -f lavfi -i 'testsrc2=size=2560x1440:rate=30:duration=1' \
  -f lavfi -i 'sine=frequency=440:duration=1' \
  -c:v libx264 -threads 1 -crf 18 -pix_fmt yuv420p -c:a aac \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart "$destination/high-resolution-avc.mp4"
