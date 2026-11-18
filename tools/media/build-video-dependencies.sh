#!/usr/bin/env bash
# Build explicitly pinned, permissive codec/color dependencies for the media role.
set -euo pipefail
build_dir="$(realpath -m "$1")"
install_dir="$(realpath -m "$2")"
mkdir -p "$build_dir" "$install_dir/share/ffmpeg/dependencies"

fetch_source() {
  local name="$1" url="$2" digest="$3"
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "$url" --output "$build_dir/$name.tar.gz"
  echo "$digest  $build_dir/$name.tar.gz" | sha256sum --check
  mkdir "$build_dir/$name"
  tar -xzf "$build_dir/$name.tar.gz" --strip-components=1 -C "$build_dir/$name"
  cp "$build_dir/$name.tar.gz" "$install_dir/share/ffmpeg/dependencies/"
}

# OpenH264 2.7.0, BSD-2-Clause; no Cisco binary-license/patent grant is assumed.
fetch_source openh264 \
  https://github.com/cisco/openh264/archive/1bca62311e447fd9c39fc93de2c4b96cd5ce971c.tar.gz \
  2238d3e5956ef0d288dd43842a0220015cf72c4327d98684e8bc47ffa7cf5308
make -C "$build_dir/openh264" -j2 BUILDTYPE=Release libraries
make -C "$build_dir/openh264" PREFIX="$install_dir" install-static
cp "$build_dir/openh264/LICENSE" "$install_dir/share/ffmpeg/dependencies/openh264-LICENSE"

# zimg 3.0.6, WTFPL-2.0; source-pinned color conversion, no GPU/runtime service.
fetch_source zimg \
  https://github.com/sekrit-twc/zimg/archive/f819b14e8f39d1282400b0d9543e8ef73c1b2bbd.tar.gz \
  4dc9faba466bce429226f0f5454cb7948ec2b70f6b5b6de383898227b38e51da
cd "$build_dir/zimg"
./autogen.sh
./configure --prefix="$install_dir" --disable-shared --enable-static
make -j2
make install
cp COPYING "$install_dir/share/ffmpeg/dependencies/zimg-COPYING"

# Keep the optional image independent of a separately installed C++ runtime.
# These are generated linker metadata, not changes to either upstream source.
for metadata in "$install_dir/lib/pkgconfig/openh264.pc" "$install_dir/lib/pkgconfig/zimg.pc"; do
  sed -i 's/-lstdc++/-Wl,-Bstatic -lstdc++ -Wl,-Bdynamic/g' "$metadata"
done
