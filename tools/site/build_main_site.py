#!/usr/bin/env python3
"""Assemble the static eimir.de main site into ``site/dist``.

The site reuses the Web app's self-hosted fonts and app icon instead of keeping copies in Git.
``--production`` refuses to build while any page still contains a ``[[PLACEHOLDER]]`` marker
(for example the unfinished imprint), so an incomplete legal text cannot be published by accident.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SITE = ROOT / "site"
DIST = SITE / "dist"

# (source relative to the repository root, destination relative to dist)
SHARED_FILES: tuple[tuple[str, str], ...] = (
    ("web/public/fonts/literata-latin-variable.woff2", "fonts/literata-latin-variable.woff2"),
    ("web/public/fonts/instrument-sans-latin-variable.woff2", "fonts/instrument-sans-latin-variable.woff2"),
    ("web/public/fonts/OFL-Literata.txt", "fonts/OFL-Literata.txt"),
    ("web/public/fonts/OFL-InstrumentSans.txt", "fonts/OFL-InstrumentSans.txt"),
    ("web/public/identity/app-icons/v1/daylight-192.png", "assets/icon-192.png"),
    ("web/public/identity/app-icons/v1/daylight-180.png", "assets/apple-touch-icon.png"),
)

PLACEHOLDER = re.compile(r"\[\[[A-Z0-9_]+\]\]")
LOCAL_REFERENCE = re.compile(r"""(?:href|src)="(/[^"#?]*)""")
CSS_URL = re.compile(r"""url\("(/[^"]+)"\)""")


def build(*, production: bool) -> list[str]:
    errors: list[str] = []
    for source, _ in SHARED_FILES:
        if not (ROOT / source).is_file():
            errors.append(f"missing shared source file: {source}")
    if errors:
        return errors

    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(
        SITE,
        DIST,
        ignore=shutil.ignore_patterns("dist"),
    )
    for source, destination in SHARED_FILES:
        target = DIST / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / source, target)

    for path in sorted(DIST.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        if production and PLACEHOLDER.search(text):
            errors.append(f"{path.relative_to(DIST)}: unresolved [[PLACEHOLDER]] marker")
        for reference in LOCAL_REFERENCE.findall(text):
            if not _resolves(reference):
                errors.append(f"{path.relative_to(DIST)}: broken local reference {reference}")
    for reference in CSS_URL.findall((DIST / "assets/site.css").read_text(encoding="utf-8")):
        if not _resolves(reference):
            errors.append(f"assets/site.css: broken local reference {reference}")
    return errors


def _resolves(reference: str) -> bool:
    target = DIST / reference.lstrip("/")
    if reference.endswith("/"):
        target = target / "index.html"
    return target.is_file()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--production", action="store_true", help="fail on unresolved placeholders")
    arguments = parser.parse_args()
    errors = build(production=arguments.production)
    if errors:
        print("Main site build failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print(f"Built {DIST.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
