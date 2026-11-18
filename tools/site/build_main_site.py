#!/usr/bin/env python3
"""Assemble the static eimir.de main site into ``site/dist``.

The site reuses the Web app's self-hosted fonts, app icon and documented demo screenshots instead of keeping copies in Git.
``--production`` refuses to build while any page still contains a ``[[PLACEHOLDER]]`` marker
(for example the unfinished imprint), so an incomplete legal text cannot be published by accident.
"""

from __future__ import annotations

import argparse
import hashlib
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
    # The app's own identity assets (web/index.html favicon, web/src/components/Brand.tsx, touch icon).
    ("web/public/identity/favicon/light.png", "assets/favicon-light.png"),
    ("web/public/identity/favicon/dark.png", "assets/favicon-dark.png"),
    ("web/public/identity/app-icon-light.png", "assets/brand-light.png"),
    ("web/public/identity/app-icon-dark.png", "assets/brand-dark.png"),
    ("web/public/apple-touch-icon.png", "assets/apple-touch-icon.png"),
    # Real captures of the Web app, see docs/assets/site/SOURCES.md.
    ("docs/assets/site/wir.webp", "assets/screens/wir.webp"),
    ("docs/assets/site/momente.webp", "assets/screens/momente.webp"),
    ("docs/assets/site/planen.webp", "assets/screens/planen.webp"),
    ("docs/assets/site/tagebuch.webp", "assets/screens/tagebuch.webp"),
    ("docs/assets/site/tagebuch-lang.webp", "assets/screens/tagebuch-lang.webp"),
    ("docs/assets/site/garten.webp", "assets/screens/garten.webp"),
    ("docs/assets/site/garten-zeitraffer.svg", "assets/screens/garten-zeitraffer.svg"),
    ("docs/assets/site/rueckblicke.webp", "assets/screens/rueckblicke.webp"),
    ("docs/assets/site/geschichte-lang.webp", "assets/screens/geschichte-lang.webp"),
    ("docs/assets/site/geschichte-zeitverlauf-0.webp", "assets/screens/geschichte-zeitverlauf-0.webp"),
    ("docs/assets/site/geschichte-zeitverlauf-1.webp", "assets/screens/geschichte-zeitverlauf-1.webp"),
    ("docs/assets/site/geschichte-zeitverlauf-2.webp", "assets/screens/geschichte-zeitverlauf-2.webp"),
    ("docs/assets/site/geschichte-zeitverlauf-3.webp", "assets/screens/geschichte-zeitverlauf-3.webp"),
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
    # Container and server configuration live next to the pages in Git but must not be served.
    shutil.copytree(
        SITE,
        DIST,
        ignore=shutil.ignore_patterns("dist", "Dockerfile", "nginx.conf", "security-headers.conf"),
    )
    for source, destination in SHARED_FILES:
        target = DIST / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / source, target)

    _fingerprint_screens()

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


def _fingerprint_screens() -> None:
    """Rename the screens after their content so a changed capture is never served from a stale cache."""
    screens = DIST / "assets/screens"
    renames: dict[str, str] = {}
    for source in sorted(screens.iterdir()):
        digest = hashlib.sha256(source.read_bytes()).hexdigest()[:10]
        target = source.with_name(f"{source.stem}.{digest}{source.suffix}")
        source.rename(target)
        renames[f"/assets/screens/{source.name}"] = f"/assets/screens/{target.name}"
    for path in [*DIST.rglob("*.html"), DIST / "assets/site.css"]:
        text = path.read_text(encoding="utf-8")
        for old, new in renames.items():
            text = text.replace(old, new)
        path.write_text(text, encoding="utf-8")


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
