"""Temporary environment compatibility for the eimir identity migration.

Callers use canonical ``EIMIR_*`` names. Existing ``SBS_*`` values are copied
only when the canonical equivalent is absent, so new configuration always has
deterministic precedence.
"""

from __future__ import annotations

import os
from collections.abc import Mapping

CANONICAL_PREFIX = "EIMIR_"
LEGACY_PREFIX = "SBS_"


def legacy_key(canonical_key: str) -> str | None:
    if not canonical_key.startswith(CANONICAL_PREFIX):
        return None
    return f"{LEGACY_PREFIX}{canonical_key.removeprefix(CANONICAL_PREFIX)}"


def canonicalize(values: Mapping[str, str]) -> dict[str, str]:
    """Return a copy with deprecated aliases exposed under canonical keys."""

    result = dict(values)
    for key, value in values.items():
        if key.startswith(LEGACY_PREFIX):
            canonical = f"{CANONICAL_PREFIX}{key.removeprefix(LEGACY_PREFIX)}"
            result.setdefault(canonical, value)
    return result


def process_value(canonical_key: str, default: str | None = None) -> str | None:
    """Read a canonical process key, falling back to its deprecated alias."""

    if canonical_key in os.environ:
        return os.environ[canonical_key]
    alias = legacy_key(canonical_key)
    if alias is not None and alias in os.environ:
        return os.environ[alias]
    return default
