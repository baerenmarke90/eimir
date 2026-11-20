"""The build revision this process runs.

Health responses, the ServerAdmin overview and the plugin loader all need the
same build identity, so it lives in a neutral module instead of a router.
"""

from __future__ import annotations

import os

UNVERIFIED_REVISION = "unverified-local-checkout"


def build_revision() -> str:
    """Return a response-header-safe build identity without exposing other config."""
    value = os.environ.get(
        "EIMIR_BUILD_REVISION",
        os.environ.get("SBS_BUILD_REVISION", UNVERIFIED_REVISION),
    ).strip()
    if not value or "\r" in value or "\n" in value:
        return "unknown"
    return value[:128]
