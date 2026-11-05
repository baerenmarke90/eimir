#!/usr/bin/env bash
# Test-only synthetic colors and tone. The shipped codec does not need generators.
set -euo pipefail
destination="$(realpath -m "${1:-backend/tests/fixtures/media}")"
mkdir -p "$destination"

generate() {
  local name="$1" codec="$2" pixels="$3" transfer="$4" audio="$5"
  local filters="format=$pixels"
  local color_options=()
  local encoder_options=()
  if [[ "$transfer" != sdr ]]; then
    filters="zscale=primariesin=bt709:transferin=bt709:matrixin=bt709:rangein=limited:primaries=bt2020:transfer=$transfer:matrix=bt2020nc:range=limited,format=$pixels"
    color_options=(-color_primaries bt2020 -color_trc "$transfer" -colorspace bt2020nc)
  fi
  if [[ "$codec" == libx265 ]]; then
    encoder_options=(-x265-params pools=none:frame-threads=1:wpp=0:log-level=error)
  fi
  local audio_options=(-map 1:a -c:a "$audio")
  if [[ "$audio" == none ]]; then audio_options=(-an); fi
  ffmpeg -hide_banner -loglevel error -nostdin -y -filter_threads 1 \
    -f lavfi -i testsrc2=size=96x64:rate=12:duration=1 \
    -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 \
    -map 0:v "${audio_options[@]}" -vf "$filters" \
    -c:v "$codec" -threads 1 "${encoder_options[@]}" "${color_options[@]}" \
    -metadata title=synthetic-private-title -metadata comment=synthetic-private-comment \
    -movflags +faststart "$destination/$name"
}

generate hevc-sdr.mp4 libx265 yuv420p sdr aac
generate hevc-hlg.mp4 libx265 yuv420p10le arib-std-b67 aac
generate hevc-pq.mp4 libx265 yuv420p10le smpte2084 aac
generate hevc-main10.mov libx265 yuv420p10le sdr none
generate h264-high10-pcm.mov libx264 yuv420p10le sdr pcm_s16le
generate h264-mp3.mp4 libx264 yuv420p sdr libmp3lame
ffmpeg -hide_banner -loglevel error -nostdin -y -display_rotation 90 \
  -i "$destination/hevc-main10.mov" -map 0:v -c copy "$destination/hevc-rotated.mov"
