"""Validate, import or describe the curated date inspiration catalog.

Usage (from ``backend/``):

    uv run python scripts/date_ideas_catalog.py validate PATH
    uv run python scripts/date_ideas_catalog.py import PATH [--allow-development]
    uv run python scripts/date_ideas_catalog.py schema [--output PATH]

``validate`` checks one file against schema version 1 and against the bundled
catalog: permanent idea IDs may be retired with ``active: false`` but never
dropped. ``import`` additionally writes the file in canonical form to the
bundled location (``src/eimir/date_ideas/data/catalog.json``). An editorial
catalog must declare ``"edition": "editorial"``; replacing it with a
development dataset requires ``--allow-development``. ``schema`` prints the JSON
Schema of the file format for editorial tooling.

No network access, provider or database is involved; the catalog ships with the
application and behaves identically in Cloud and Self-Hosted deployments.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

from pydantic import ValidationError

from eimir.date_ideas.catalog import (
    CatalogFile,
    canonical_json,
    parse_catalog,
    removed_idea_ids,
)

BUNDLED = Path(__file__).resolve().parents[1] / "src/eimir/date_ideas/data/catalog.json"


def _load(path: Path) -> CatalogFile:
    return parse_catalog(path.read_bytes())


def _report(catalog: CatalogFile) -> str:
    active = [idea for idea in catalog.ideas if idea.active]
    per_locale = Counter(locale for idea in active for locale in idea.content)
    categories = Counter(idea.category for idea in active)
    lines = [
        f"catalog {catalog.catalog_version} ({catalog.edition}), schema {catalog.schema_version}",
        f"{len(active)} active of {len(catalog.ideas)} ideas",
        "translations: "
        + ", ".join(f"{locale} {per_locale[locale]}" for locale in catalog.locales),
        "categories: " + ", ".join(f"{key} {count}" for key, count in sorted(categories.items())),
    ]
    return "\n".join(lines)


def _validate(path: Path) -> CatalogFile:
    candidate = _load(path)
    if BUNDLED.exists() and BUNDLED.resolve() != path.resolve():
        dropped = removed_idea_ids(_load(BUNDLED), candidate)
        if dropped:
            raise SystemExit(
                "error: permanent idea IDs were removed; retire them with "
                f'"active": false instead: {", ".join(dropped)}'
            )
    return candidate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    validate = commands.add_parser("validate")
    validate.add_argument("path", type=Path)
    importer = commands.add_parser("import")
    importer.add_argument("path", type=Path)
    importer.add_argument("--allow-development", action="store_true")
    schema = commands.add_parser("schema")
    schema.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    if args.command == "schema":
        text = json.dumps(CatalogFile.model_json_schema(by_alias=True), indent=2) + "\n"
        if args.output:
            args.output.write_text(text, encoding="utf-8")
        else:
            sys.stdout.write(text)
        return 0

    try:
        candidate = _validate(args.path)
    except ValidationError as error:
        sys.stderr.write(f"error: {args.path} is not a valid catalog\n{error}\n")
        return 1

    if args.command == "import":
        if candidate.edition == "development" and not args.allow_development:
            sys.stderr.write(
                "error: refusing to import a development dataset without --allow-development\n"
            )
            return 1
        text = canonical_json(candidate)
        BUNDLED.write_text(text, encoding="utf-8")
        print(f"imported into {BUNDLED}")

    print(_report(candidate))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
