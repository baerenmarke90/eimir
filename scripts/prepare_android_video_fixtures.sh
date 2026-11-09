#!/usr/bin/env bash
# Synthetic codec fixtures only; no private recording enters the test APK.
set -euo pipefail
cd "$(dirname "$0")/.."
destination=android/app/src/androidTest/assets/video-preparation
mkdir -p "$destination"
cp backend/tests/fixtures/media/video-with-metadata.mp4 "$destination/"
# x265's unrestricted lossless reference signals level 255. Produce actual
# Main 10 / level 3.1 streams for Android's bounded decoders, keeping HDR intact.
for fixture in hlg-highlight-steps.mp4 pq-highlight-steps.mp4 pq-mastered-steps.mp4; do
  encoder_params='pools=none:frame-threads=1:wpp=0:log-level=error:level-idc=3.1:vbv-maxrate=10000:vbv-bufsize=10000'
  if [ "$fixture" = 'pq-mastered-steps.mp4' ]; then
    encoder_params+=':master-display=G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)L(10000000,50):max-cll=1000,400'
  fi
  ffmpeg -hide_banner -loglevel error -nostdin -y \
    -i "backend/tests/fixtures/media/$fixture" -map 0:v:0 -an \
    -c:v libx265 -threads 1 -pix_fmt yuv420p10le -profile:v main10 -crf 0 \
    -x265-params "$encoder_params" \
    -movflags +faststart "$destination/$fixture"
done
python3 - "$destination" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

for name, transfer in (('hlg-highlight-steps.mp4', 'arib-std-b67'),
                       ('pq-highlight-steps.mp4', 'smpte2084'),
                       ('pq-mastered-steps.mp4', 'smpte2084')):
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries',
        'stream=profile,level,pix_fmt,color_transfer,color_primaries,color_space',
        '-of', 'json', str(Path(sys.argv[1]) / name),
    ]))['streams'][0]
    if probe != dict(profile='Main 10', level=93, pix_fmt='yuv420p10le',
                     color_transfer=transfer, color_primaries='bt2020', color_space='bt2020nc'):
        raise SystemExit('Native HDR fixtures must retain HDR in a conformant Main 10 stream.')
PY
ffmpeg -hide_banner -loglevel error -nostdin -y -filter_threads 1 \
  -f lavfi -i 'testsrc2=size=2560x1440:rate=30:duration=1' \
  -f lavfi -i 'sine=frequency=440:duration=1' \
  -c:v libx264 -threads 1 -crf 18 -pix_fmt yuv420p -c:a aac \
  -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
  -movflags +faststart "$destination/high-resolution-avc.mp4"
