#!/usr/bin/env bash
#
# Generate the client API layers from the versioned OpenAPI contract.
#
#   tools/openapi/generate.sh          regenerate clients
#   tools/openapi/generate.sh --check      check all committed clients for drift\n#   tools/openapi/generate.sh --check-web  check the canonical Web client for drift (CI)
#
# `backend/openapi.json` is the single source of truth consumed here. This
# script does not produce the contract; backend code owns it, and the existing
# contract check keeps the committed document aligned with the real ASGI app.
#
# The generator runs in its official container pinned by version and digest.
# This avoids requiring a local JDK and keeps generated output reproducible
# across developer machines.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"

# shellcheck source=/dev/null
source tools/openapi/generator.env
image="openapitools/openapi-generator-cli:${OPENAPI_GENERATOR_VERSION}@${OPENAPI_GENERATOR_DIGEST}"

contract="backend/openapi.json"
ts_target="web/src/api/generated"
kt_target="android/api/generated"

check_mode="${1:-}"

if [ ! -f "$contract" ]; then
  echo "OpenAPI contract is missing: $contract" >&2
  exit 1
fi

# Run the container as the invoking user so generated files do not become
# root-owned and make the next local run fail with permission errors.
run_generator() {
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    --volume "$root:/local" \
    --workdir /local \
    "$image" "$@"
}

generate_clients() {
  local output_ts="$1"
  local output_kt="$2"

  rm -rf "$output_ts" "$output_kt"

  run_generator generate \
    --input-spec "$contract" \
    --generator-name typescript-fetch \
    --config tools/openapi/typescript-fetch.yaml \
    --output "$output_ts" \
    --skip-validate-spec \
    >/dev/null

  run_generator generate \
    --input-spec "$contract" \
    --generator-name kotlin \
    --config tools/openapi/kotlin-models.yaml \
    --output "$output_kt" \
    --global-property models,modelDocs=false,modelTests=false \
    --skip-validate-spec \
    >/dev/null

  # The generator creates metadata containing its version in every output
  # directory. Keeping that file would create unrelated diffs on each version
  # bump; generator.env already records the generator version explicitly.
  find "$output_ts" "$output_kt" -name '.openapi-generator' -type d -exec rm -rf {} + 2>/dev/null || true
  find "$output_ts" "$output_kt" -name '.openapi-generator-ignore' -delete 2>/dev/null || true
}

if [ "$check_mode" = "--check-web" ]; then
  # Product CI is Web-first. Keep the legacy Kotlin model output untouched until
  # repository cleanup (#1009), but do not make it a product-quality gate.
  temp="$root/.openapi-check"
  trap 'rm -rf "$temp"' EXIT
  rm -rf "$temp"
  run_generator generate \
    --input-spec "$contract" \
    --generator-name typescript-fetch \
    --config tools/openapi/typescript-fetch.yaml \
    --output ".openapi-check/ts" \
    --skip-validate-spec \
    >/dev/null
  find "$temp/ts" -name '.openapi-generator' -type d -exec rm -rf {} + 2>/dev/null || true
  find "$temp/ts" -name '.openapi-generator-ignore' -delete 2>/dev/null || true
  if ! diff -r -q "$temp/ts" "$ts_target" >/dev/null 2>&1; then
    echo "Committed Web client code differs from the OpenAPI contract."
    echo "Regenerate with: tools/openapi/generate.sh"
    diff -r "$ts_target" "$temp/ts" || true
    exit 1
  fi
  echo "Web client code matches the OpenAPI contract."
  exit 0
fi

if [ "$check_mode" = "--check" ]; then
  # The comparison output must live inside the repository because that is the
  # only directory mounted into the container. It must not mutate committed
  # output; otherwise CI would repair the exact drift it is supposed to report.
  temp="$root/.openapi-check"
  trap 'rm -rf "$temp"' EXIT
  generate_clients ".openapi-check/ts" ".openapi-check/kt"
  drift=0
  diff -r -q "$temp/ts" "$ts_target" >/dev/null 2>&1 || drift=1
  diff -r -q "$temp/kt" "$kt_target" >/dev/null 2>&1 || drift=1
  if [ "$drift" -ne 0 ]; then
    echo "Committed client code differs from the OpenAPI contract."
    echo "Regenerate with: tools/openapi/generate.sh"
    diff -r "$ts_target" "$temp/ts" || true
    diff -r "$kt_target" "$temp/kt" || true
    exit 1
  fi
  echo "Client code matches the OpenAPI contract."
  exit 0
fi

generate_clients "$ts_target" "$kt_target"
echo "Generated: $ts_target and $kt_target"
