#!/usr/bin/env bash
#
# Generate the Kotlin API models of the native Android test client from the
# authoritative OpenAPI contract (`backend/openapi.json`).
#
#   android-native-test/tools/generate-api-models.sh          regenerate
#   android-native-test/tools/generate-api-models.sh --check  report drift
#
# The generator image and digest are shared with tools/openapi/generate.sh so
# Web and native clients are produced by the identical generator release.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

# shellcheck source=/dev/null
source tools/openapi/generator.env
image="openapitools/openapi-generator-cli:${OPENAPI_GENERATOR_VERSION}@${OPENAPI_GENERATOR_DIGEST}"
target="android-native-test/api/generated"
mode="${1:-}"

generate() {
  local output="$1"
  rm -rf "$output"
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "$root:/local" \
    --workdir /local \
    "$image" generate \
    --input-spec backend/openapi.json \
    --generator-name kotlin \
    --config android-native-test/tools/kotlin-models.yaml \
    --output "$output" \
    --global-property models,modelDocs=false,modelTests=false \
    --skip-validate-spec \
    >/dev/null
  find "$output" -name '.openapi-generator' -type d -exec rm -rf {} + 2>/dev/null || true
  find "$output" -name '.openapi-generator-ignore' -delete 2>/dev/null || true
}

case "$mode" in
  "")
    generate "$target"
    ;;
  --check)
    temp=".native-openapi-check"
    trap 'rm -rf "$root/$temp"' EXIT
    generate "$temp"
    if ! diff -r -q "$temp" "$target" >/dev/null 2>&1; then
      echo "Native Kotlin models differ from backend/openapi.json."
      echo "Regenerate with: android-native-test/tools/generate-api-models.sh"
      exit 1
    fi
    echo "Native Kotlin models match the OpenAPI contract."
    ;;
  *)
    echo "Usage: $0 [--check]" >&2
    exit 2
    ;;
esac
