"""Validate or import the curated date-idea catalog (editorial schema v1).

Usage (from ``backend/``):

    uv run python scripts/date_ideas_catalog.py validate PATH
    uv run python scripts/date_ideas_catalog.py import PATH
    uv run python scripts/date_ideas_catalog.py validate-images DIR
    uv run python scripts/date_ideas_catalog.py import-images DIR

``validate`` checks one file against the catalog models, which mirror the
editorial JSON Schema (``docs/product/date-inspiration/catalog.schema.json``)
and additionally require unique idea IDs. It also compares the file with the
bundled catalog: persistent idea IDs must never disappear. ``import`` runs the
same checks and then copies the file byte for byte to the bundled location
(``src/eimir/date_ideas/data/catalog.json``), so the repository keeps exactly
the editorial handoff.

``validate-images`` and ``import-images`` take a handoff directory containing
``eimir-date-ideas.images.v1.json`` and its ``images/`` folder. The manifest
must match the bundled catalog version, cover every category, reference only
known ideas and point to existing WebP files. Import replaces the bundled
manifest (``src/eimir/date_ideas/data/images.json``) and image folder.

No network access, provider or database is involved; the catalog ships with
the application and behaves identically in Cloud and Self-Hosted deployments.
It is served only through the Pro-gated API, never as a public client asset.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

from eimir.date_ideas.catalog import CatalogFile, parse_catalog, removed_idea_ids
from eimir.date_ideas.images import manifest_problems, parse_manifest

BUNDLED = Path(__file__).resolve().parents[1] / "src/eimir/date_ideas/data/catalog.json"
IMAGE_MANIFEST_NAME = "eimir-date-ideas.images.v1.json"


def _images(command: str, directory: Path) -> int:
    source = directory / IMAGE_MANIFEST_NAME
    try:
        manifest = parse_manifest(source.read_bytes())
    except (OSError, ValidationError) as error:
        sys.stderr.write(f"error: {source} is not a valid image manifest\n{error}\n")
        return 1
    problems = manifest_problems(manifest, directory)
    if problems:
        sys.stderr.write("error: " + "; ".join(problems) + "\n")
        return 1
    if command == "import-images":
        target = BUNDLED.parent
        shutil.rmtree(target / "images", ignore_errors=True)
        (target / "images").mkdir()
        for entry in manifest.entries():
            shutil.copyfile(directory / entry.file, target / entry.file)
        shutil.copyfile(source, target / "images.json")
        print(f"imported {len(manifest.entries())} images into {target}")
    print(
        f"{len(manifest.images_by_idea_id)} idea images, "
        f"{len(manifest.images_by_category)} category images"
    )
    return 0


def _report(catalog: CatalogFile) -> str:
    categories = Counter(idea.category.value for idea in catalog.ideas)
    places = Counter(idea.place_type.value for idea in catalog.ideas)
    return "\n".join(
        [
            f"catalog {catalog.catalog_version}, schema {catalog.schema_version}, "
            f"{len(catalog.ideas)} ideas in {', '.join(catalog.locales)}",
            "categories: " + ", ".join(f"{key} {n}" for key, n in sorted(categories.items())),
            "places: " + ", ".join(f"{key} {n}" for key, n in sorted(places.items())),
        ]
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("validate", "import", "validate-images", "import-images"):
        commands.add_parser(name).add_argument("path", type=Path)
    args = parser.parse_args(argv)
    if args.command in ("validate-images", "import-images"):
        return _images(args.command, args.path)

    raw = args.path.read_bytes()
    try:
        candidate = parse_catalog(raw)
    except ValidationError as error:
        sys.stderr.write(f"error: {args.path} is not a valid catalog\n{error}\n")
        return 1
    if BUNDLED.exists() and BUNDLED.resolve() != args.path.resolve():
        dropped = removed_idea_ids(parse_catalog(BUNDLED.read_bytes()), candidate)
        if dropped:
            sys.stderr.write(
                "error: persistent idea IDs would disappear: " + ", ".join(dropped) + "\n"
            )
            return 1

    if args.command == "import":
        BUNDLED.write_bytes(raw)
        print(f"imported into {BUNDLED}")
    print(_report(candidate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
