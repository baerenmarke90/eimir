#!/usr/bin/env bash
#
# Build the signed, installable test APK of the native Android test client.
#
#   android-native-test/tools/build-signed-apk.sh <versionCode>
#
# Signing material never lives in this repository. The script reads the
# dedicated native-test key (package de.eimir.nativetest, never the Capacitor
# test or release key) from local custody:
#
#   keystore  : $EIMIR_NATIVE_KEYSTORE
#               (default: ~/Library/Application Support/eimir-native-test/signing/eimir-native-test.p12)
#   password  : $EIMIR_NATIVE_KEYSTORE_PASSWORD, otherwise the macOS Keychain
#               item "eimir-native-test-signing" (account "eimir-native-test")
#
# The build is pinned to the eimir-test origin and records the source commit.
# It prints package, version, signer certificate digest and APK SHA-256.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

version_code="${1:?Usage: build-signed-apk.sh <versionCode>}"
keystore="${EIMIR_NATIVE_KEYSTORE:-$HOME/Library/Application Support/eimir-native-test/signing/eimir-native-test.p12}"
password="${EIMIR_NATIVE_KEYSTORE_PASSWORD:-}"
if [ -z "$password" ] && command -v security >/dev/null 2>&1; then
  password="$(security find-generic-password -a eimir-native-test -s eimir-native-test-signing -w)"
fi
if [ ! -f "$keystore" ] || [ -z "$password" ]; then
  echo "Native test signing key or password is not available; see android-native-test/README.md." >&2
  exit 1
fi

revision="$(git rev-parse --short=12 HEAD)"
if [ -n "$(git status --porcelain -- . ../backend/openapi.json ../design/tokens.json)" ]; then
  revision="${revision}-dirty"
fi

export EIMIR_NATIVE_KEYSTORE="$keystore"
export EIMIR_NATIVE_KEYSTORE_PASSWORD="$password"
export EIMIR_NATIVE_KEY_PASSWORD="$password"
export EIMIR_NATIVE_KEY_ALIAS="eimir-native-test"

java_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home}"
./gradlew --no-daemon -Dorg.gradle.java.home="$java_home" \
  -PeimirNativeVersionCode="$version_code" \
  -PeimirNativeSourceRevision="$revision" \
  :app:assembleRelease

apk="app/build/outputs/apk/release/app-release.apk"
build_tools="$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/build-tools/* | sort -V | tail -1)"
"$build_tools/apksigner" verify --print-certs "$apk" | grep -E 'Signer #1 certificate (DN|SHA-256)'
"$build_tools/aapt2" dump badging "$apk" | head -1
echo "source revision: $revision"
shasum -a 256 "$apk"
