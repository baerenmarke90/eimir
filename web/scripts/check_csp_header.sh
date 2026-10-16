#!/bin/sh

set -eu

eimir_url=${1:?Usage: check_csp_header.sh URL [additional-connect-origins]}
eimir_extra_origins=${2:-}
eimir_headers=$(mktemp)
eimir_body=$(mktemp)
trap 'rm -f "$eimir_headers" "$eimir_body"' EXIT HUP INT TERM

curl --fail --silent --show-error --dump-header "$eimir_headers" \
    --output "$eimir_body" "$eimir_url"

eimir_header_count=$(grep -ic '^Content-Security-Policy:' "$eimir_headers" || true)
if [ "$eimir_header_count" -ne 1 ]; then
    echo "Expected exactly one Content-Security-Policy header, found: $eimir_header_count" >&2
    exit 1
fi

eimir_actual=$(grep -i '^Content-Security-Policy:' "$eimir_headers" \
    | tr -d '\r' \
    | sed 's/^[^:]*:[[:space:]]*//')
eimir_connect="'self'"
if [ -n "$eimir_extra_origins" ]; then
    eimir_connect="$eimir_connect $eimir_extra_origins"
fi
eimir_expected="default-src 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; frame-src 'none'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self'; style-src-attr 'none'; img-src 'self' blob:; font-src 'self'; connect-src $eimir_connect; media-src 'none'; manifest-src 'none'; worker-src 'none'"

if [ "$eimir_actual" != "$eimir_expected" ]; then
    echo "Unexpected Content-Security-Policy:" >&2
    echo "$eimir_actual" >&2
    exit 1
fi

echo "Content-Security-Policy: restrictive header is present"
