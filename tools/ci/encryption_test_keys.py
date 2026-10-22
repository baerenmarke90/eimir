#!/usr/bin/env python3
"""Generate throwaway encryption keys for a CI run (issue #797).

Appends the encryption settings for one workflow run to the file given as the only
argument (the runner's ``$GITHUB_ENV``) and masks the key in the job log. The key
comes from the OS random source, exists only for this run, and is never written
anywhere else, so there is no test key that could be mistaken for, or copied into, a
production configuration.

    python3 tools/ci/encryption_test_keys.py "$GITHUB_ENV"
"""

from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

KEY_LENGTH = 32
KEY_ID = "ci-run"


def render(raw_key: bytes) -> tuple[str, list[str]]:
    """Return the masked value and the ``KEY=value`` lines for an environment file."""
    if len(raw_key) != KEY_LENGTH:
        raise ValueError("Encryption keys must be exactly 32 bytes.")
    encoded = base64.b64encode(raw_key).decode("ascii")
    return encoded, [
        f"EIMIR_ENCRYPTION_KEYS={json.dumps({KEY_ID: encoded}, separators=(',', ':'))}",
        f"EIMIR_ENCRYPTION_ACTIVE_KEY_ID={KEY_ID}",
    ]


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: encryption_test_keys.py ENV_FILE", file=sys.stderr)
        return 2
    encoded, lines = render(os.urandom(KEY_LENGTH))
    # Mask before the value can reach any later log line.
    print(f"::add-mask::{encoded}")
    with Path(argv[0]).open("a", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
