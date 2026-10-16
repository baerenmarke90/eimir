#!/usr/bin/env bash
#
# Generate the canonical Web API client from the versioned OpenAPI contract.
#
#   tools/openapi/generate.sh              regenerate the client
#   tools/openapi/generate.sh --check      check the committed client for drift (CI)
#   tools/openapi/generate.sh --check-web  alias of --check, kept for CI compatibility
#
# `backend/openapi.json` is the single source of truth consumed here. This
# script does not produce the contract; backend code owns it, and the existing
# contract check keeps the committed document aligned with the real ASGI app.
#
# The Android app is the Capacitor wrapper around the Web product and consumes
# this same TypeScript client; there is no second generated client.
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

mode="${1:-}"
case "$mode" in
  "" | --check | --check-web) ;;
  *)
    echo "Unknown argument: $mode" >&2
    echo "Usage: tools/openapi/generate.sh [--check|--check-web]" >&2
    exit 2
    ;;
esac

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

generate_client() {
  local output_ts="$1"

  rm -rf "$output_ts"

  run_generator generate \
    --input-spec "$contract" \
    --generator-name typescript-fetch \
    --config tools/openapi/typescript-fetch.yaml \
    --output "$output_ts" \
    --skip-validate-spec \
    >/dev/null

  # The generator creates metadata containing its version in every output
  # directory. Keeping that file would create unrelated diffs on each version
  # bump; generator.env already records the generator version explicitly.
  find "$output_ts" -name '.openapi-generator' -type d -exec rm -rf {} + 2>/dev/null || true
  find "$output_ts" -name '.openapi-generator-ignore' -delete 2>/dev/null || true
}

if [ "$mode" = "--check" ] || [ "$mode" = "--check-web" ]; then
  # The comparison output must live inside the repository because that is the
  # only directory mounted into the container. It must not mutate committed
  # output; otherwise CI would repair the exact drift it is supposed to report.
  temp="$root/.openapi-check"
  trap 'rm -rf "$temp"' EXIT
  generate_client ".openapi-check/ts"
  if ! diff -r -q "$temp/ts" "$ts_target" >/dev/null 2>&1; then
    echo "Committed Web client code differs from the OpenAPI contract."
    echo "Regenerate with: tools/openapi/generate.sh"
    diff -r "$ts_target" "$temp/ts" || true
    exit 1
  fi
  echo "Web client code matches the OpenAPI contract."
  exit 0
fi

generate_client "$ts_target"
echo "Generated: $ts_target"
