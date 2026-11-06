#!/usr/bin/env bash
# Build the reviewed local video/voice input and verified H.264/AAC output surface.
set -euo pipefail
source_dir="$(realpath "$1")"
install_dir="$(realpath -m "$2")"
patch_dir="$(cd "$(dirname "$0")" && pwd)"
cd "$source_dir"
patch -p1 --forward < "$patch_dir/reject-encrypted-mov.patch"
patch -p1 --forward < "$patch_dir/guard-h264-context.patch"
patch -p1 --forward < "$patch_dir/initialize-hdr-payload.patch"
export PKG_CONFIG_PATH="$install_dir/lib/pkgconfig"
./configure \
  --prefix="$install_dir" \
  --disable-everything --disable-autodetect --disable-network \
  --disable-doc --disable-debug --disable-x86asm --disable-avdevice \
  --disable-shared --enable-static --enable-ffmpeg --enable-ffprobe \
  --enable-libopenh264 --enable-libzimg --pkg-config-flags=--static \
  --extra-cflags="-I$install_dir/include" \
  --extra-ldflags="-L$install_dir/lib -static-libstdc++ -static-libgcc" --ld=g++ \
  --enable-protocol=file,pipe --enable-demuxer=mov,ogg,matroska,mp3,wav,aac \
  --enable-muxer=mp4,image2,null,wav \
  --enable-decoder=h264,hevc,opus,vorbis,aac,mp3float,pcm_s16le,pcm_s24le,pcm_s32le,pcm_f32le,pcm_s16be,pcm_s24be \
  --enable-parser=h264,hevc,aac,mpegaudio,opus,vorbis \
  --enable-encoder=libopenh264,aac,mjpeg,wrapped_avframe,pcm_s16le \
  --enable-bsf=filter_units,h264_metadata,h264_mp4toannexb,aac_adtstoasc \
  --enable-filter=scale,format,null,anull,aresample,aformat,transpose,hflip,vflip,zscale,tonemap,fps,sidedata
make -j2
cc -I . -c "$patch_dir/test-h264-context.c" -o "$source_dir/test-h264-context.o"
g++ "$source_dir/test-h264-context.o" libavcodec/libavcodec.a libavutil/libavutil.a \
  $(pkg-config --libs --static openh264) -lm -pthread -o "$source_dir/test-h264-context"
"$source_dir/test-h264-context"
cc -I . "$patch_dir/test-hdr-payload.c" libavutil/libavutil.a \
  -lm -pthread -o "$source_dir/test-hdr-payload"
"$source_dir/test-hdr-payload"
make install-progs
case "$(ldd "$install_dir/bin/ffmpeg")" in
  *libstdc++*|*libopenh264*|*libzimg*)
    echo "Media normalization dependencies must be linked statically." >&2
    exit 1
    ;;
esac
mkdir -p "$install_dir/share/ffmpeg"
cp COPYING.LGPLv2.1 LICENSE.md ffbuild/config.mak "$install_dir/share/ffmpeg/"
"$install_dir/bin/ffmpeg" -version > "$install_dir/share/ffmpeg/build-version.txt"
