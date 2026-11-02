#!/usr/bin/env bash
# Build only the local MP4/H.264/AAC processing surface. No external codec SDK.
set -euo pipefail
source_dir="$(realpath "$1")"
install_dir="$(realpath -m "$2")"
patch_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$source_dir"
patch -p1 --forward < "$patch_dir/reject-encrypted-mov.patch"
./configure \
  --prefix="$install_dir" \
  --disable-everything --disable-autodetect --disable-network \
  --disable-doc --disable-debug --disable-x86asm --disable-avdevice \
  --disable-shared --enable-static --enable-ffmpeg --enable-ffprobe \
  --enable-protocol=file,pipe --enable-demuxer=mov \
  --enable-muxer=mp4,image2,null --enable-decoder=h264,aac \
  --enable-parser=h264,aac --enable-encoder=mjpeg,wrapped_avframe,pcm_s16le \
  --enable-bsf=filter_units,h264_metadata,h264_mp4toannexb,aac_adtstoasc \
  --enable-filter=scale,format,null,anull,aresample,aformat,transpose,hflip,vflip
make -j2
make install-progs
mkdir -p "$install_dir/share/ffmpeg"
cp COPYING.LGPLv2.1 LICENSE.md ffbuild/config.mak "$install_dir/share/ffmpeg/"
"$install_dir/bin/ffmpeg" -version > "$install_dir/share/ffmpeg/build-version.txt"
