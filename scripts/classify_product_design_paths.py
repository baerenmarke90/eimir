#!/usr/bin/env python3
"""Classify pull request paths for mandatory Product Design / UX review.

Determines whether changed files contain user-facing presentation, design tokens,
brand assets, or client application code according to Issue #675.

Authoritative presentation/runtime source graph includes:
- design/tokens.json and design-system machine-readable assets under design/
- web/public/** (runtime brand, icons, favicons, entry scripts)
- web/index.html (HTML entry point, meta tags, titles)
- web/src/** EXCEPT contract-generated code in web/src/api/generated/**
"""

from __future__ import annotations

import re
import sys
from collections.abc import Iterable
from pathlib import PurePosixPath

# Regex patterns matching presentation/runtime files that affect user experience.
USER_FACING_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^design/"),
    re.compile(r"^web/index\.html$"),
    re.compile(r"^web/public/"),
    re.compile(r"^web/src/"),
)

# Contract artifacts generated from OpenAPI are API schemas, not visual UI.
EXCLUDED_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"^web/src/api/generated/"),
)


def is_user_facing_path(path: str) -> bool:
    """Return True if path represents a user-facing or presentation-runtime source."""
    normalized = PurePosixPath(path.strip()).as_posix()
    if not normalized:
        return False

    for excluded in EXCLUDED_PATTERNS:
        if excluded.search(normalized):
            return False

    for pattern in USER_FACING_PATTERNS:
        if pattern.search(normalized):
            return True

    return False


def classify_paths(paths: Iterable[str]) -> list[str]:
    """Filter an iterable of paths, returning only those classified as user-facing."""
    return [path.strip() for path in paths if is_user_facing_path(path)]


def main() -> int:
    """CLI entrypoint: classify paths from args or stdin, print matches."""
    if len(sys.argv) > 1:
        raw_paths = sys.argv[1:]
    else:
        raw_paths = sys.stdin.read().splitlines()

    matches = classify_paths(raw_paths)
    for path in matches:
        print(path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
