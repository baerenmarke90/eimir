#!/bin/sh

set -eu

eimir_validator=${1:-docker-entrypoint.d/19-validate-csp-connect-src.envsh}

eimir_run_validator() {
    EIMIR_WEB_CSP_CONNECT_ORIGINS=$1 sh -c \
        '. "$1"; printf "%s" "$EIMIR_WEB_CSP_CONNECT_ORIGINS"' \
        sh "$eimir_validator"
}

eimir_assert_accepts() {
    eimir_input=$1
    eimir_expected=$2
    eimir_actual=$(eimir_run_validator "$eimir_input")
    if [ "$eimir_actual" != "$eimir_expected" ]; then
        echo "CSP origin was normalized incorrectly." >&2
        exit 1
    fi
}

eimir_assert_rejects() {
    if eimir_run_validator "$1" >/dev/null 2>&1; then
        echo "Unsafe CSP source was accepted." >&2
        exit 1
    fi
}

eimir_assert_accepts '' ''
eimir_assert_accepts 'https://api.example.test' ' https://api.example.test'
eimir_assert_accepts \
    '  https://api.example.test   https://s3.example.test:9443  ' \
    ' https://api.example.test https://s3.example.test:9443'
eimir_assert_accepts 'http://localhost:9000 https://[::1]:9443' \
    ' http://localhost:9000 https://[::1]:9443'
eimir_assert_accepts 'https://example.test:65535' ' https://example.test:65535'

eimir_assert_rejects 'https:'
eimir_assert_rejects 'https://*.example.test'
eimir_assert_rejects 'https://user@example.test'
eimir_assert_rejects 'https://example.test/path'
eimir_assert_rejects 'https://example.test:65536'
eimir_assert_rejects "'unsafe-inline'"
eimir_assert_rejects "https://example.test; add_header X-Injected true"

echo "CSP origin validation: successful"
