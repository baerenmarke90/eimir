"""Operator command line for data portability (Decision 0020).

    python -m eimir_pro.portability export --space SPACE --member ACCOUNT --output FILE
        [--scope shared|personal] [limit options]
    python -m eimir_pro.portability import --space SPACE --member ACCOUNT --input FILE
        [--map SOURCE=TARGET ...] [--dry-run] [limit options]

Runs with the same environment as the API (database URL, media store, keys) and refuses
to run unless the database is at the Alembic revision the tool was verified against. It
prints names, counts and identifiers only, never content. The export file is plaintext:
see ``RUNBOOK.md`` next to this module.
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
from collections.abc import Sequence
from pathlib import Path
from uuid import UUID

from sqlalchemy import create_engine

from eimir.config import get_settings
from eimir.core.errors import BadRequestError, PayloadTooLargeError
from eimir.db.registry import load_all_models
from eimir_pro.portability.archive import GIB, MIB, OPERATOR_LIMITS, BundleLimits
from eimir_pro.portability.common import PortabilityError, TransferScope
from eimir_pro.portability.operations import run_export, run_import

_SIZE = re.compile(r"^(\d+)\s*(b|kib|mib|gib)?$", re.IGNORECASE)
_UNITS = {None: 1, "b": 1, "kib": 1024, "mib": MIB, "gib": GIB}


def parse_size(value: str) -> int:
    """Bytes from ``2GiB``, ``512MiB``, ``64KiB`` or a plain number of bytes."""
    match = _SIZE.fullmatch(value.strip())
    if match is None:
        raise argparse.ArgumentTypeError(f"not a size: {value!r} (examples: 512MiB, 2GiB)")
    number, unit = match.groups()
    size = int(number) * _UNITS[unit.lower() if unit else None]
    if size <= 0:
        raise argparse.ArgumentTypeError("a size must be greater than zero")
    return size


def _positive_int(value: str) -> int:
    try:
        number = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not a number: {value!r}") from None
    if number <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return number


def _uuid(value: str) -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"not an identifier: {value!r}") from None


def _mapping(value: str) -> tuple[UUID, UUID]:
    source, separator, target = value.partition("=")
    if not separator:
        raise argparse.ArgumentTypeError("use SOURCE=TARGET with two account identifiers")
    return _uuid(source), _uuid(target)


def _add_limit_options(parser: argparse.ArgumentParser) -> None:
    group = parser.add_argument_group(
        "limits",
        "Resource budgets, applied while writing and again while reading the same file. "
        f"Defaults: {OPERATOR_LIMITS.max_compressed_bytes // GIB} GiB file, "
        f"{OPERATOR_LIMITS.max_uncompressed_bytes // GIB} GiB unpacked, "
        f"{OPERATOR_LIMITS.max_entry_bytes // MIB} MiB per entry, "
        f"{OPERATOR_LIMITS.max_entries} entries.",
    )
    group.add_argument("--max-bundle-size", type=parse_size, metavar="SIZE")
    group.add_argument("--max-unpacked-size", type=parse_size, metavar="SIZE")
    group.add_argument("--max-entry-size", type=parse_size, metavar="SIZE")
    group.add_argument("--max-entries", type=_positive_int, metavar="N")
    group.add_argument("--max-json-size", type=parse_size, metavar="SIZE")
    group.add_argument("--max-compression-ratio", type=_positive_int, metavar="N")


def _limits(args: argparse.Namespace) -> BundleLimits:
    chosen = {
        "max_compressed_bytes": args.max_bundle_size,
        "max_uncompressed_bytes": args.max_unpacked_size,
        "max_entry_bytes": args.max_entry_size,
        "max_entries": args.max_entries,
        "max_json_bytes": args.max_json_size,
        "max_compression_ratio": args.max_compression_ratio,
    }
    return BundleLimits(
        **{
            name: value if value is not None else getattr(OPERATOR_LIMITS, name)
            for name, value in chosen.items()
        }
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m eimir_pro.portability", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    export = commands.add_parser("export", help="Write one Space to a bundle file on disk.")
    export.add_argument("--space", type=_uuid, required=True, metavar="SPACE")
    export.add_argument(
        "--member",
        type=_uuid,
        required=True,
        metavar="ACCOUNT",
        help="The active member whose view is exported.",
    )
    export.add_argument(
        "--scope",
        choices=("shared", "personal"),
        default="shared",
        help="shared: the content both partners see. personal: also this member's private data.",
    )
    export.add_argument("--output", type=Path, required=True, metavar="FILE")
    _add_limit_options(export)

    import_ = commands.add_parser("import", help="Add a bundle file to one Space.")
    import_.add_argument("--space", type=_uuid, required=True, metavar="SPACE")
    import_.add_argument(
        "--member",
        type=_uuid,
        required=True,
        metavar="ACCOUNT",
        help="The active target member who corresponds to the member that ran the export.",
    )
    import_.add_argument("--input", type=Path, required=True, metavar="FILE")
    import_.add_argument(
        "--map",
        type=_mapping,
        action="append",
        default=[],
        metavar="SOURCE=TARGET",
        help="Map a member of the bundle to a member of the target Space when their verified "
        "emails do not decide it. Repeatable.",
    )
    import_.add_argument(
        "--dry-run", action="store_true", help="Validate and plan, but write nothing."
    )
    _add_limit_options(import_)
    return parser


def _print_summary(values: dict[str, object]) -> None:
    for name, value in sorted(values.items()):
        print(f"{name}={value}")


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        limits = _limits(args)
        load_all_models()
        engine = create_engine(get_settings().database_url, future=True)
        if args.command == "export":
            result = run_export(
                engine,
                space_id=args.space,
                account_id=args.member,
                scope=TransferScope(args.scope.upper()),
                destination=args.output,
                limits=limits,
            )
            print(f"file={result.path}")
            print(f"scope={result.scope.value}")
            print(f"bytes={result.size}")
            print(f"entries={result.entry_count}")
            print(f"media={result.media_count}")
            for name, count in sorted(result.record_counts.items()):
                print(f"records.{name}={count}")
            print("The file is plaintext. Handle it as a secret and delete it when done.")
            return 0
        overrides = dict(args.map)
        if len(overrides) != len(args.map):
            raise PortabilityError("A bundle member is mapped twice.")
        report = run_import(
            engine,
            space_id=args.space,
            account_id=args.member,
            source=args.input,
            overrides=overrides,
            limits=limits,
            dry_run=args.dry_run,
        )
        print("result=" + ("validated, nothing written" if report.dry_run else "imported"))
        for name, value in sorted(report.summary.items()):
            if isinstance(value, dict):
                for key, count in sorted(value.items()):
                    print(f"{name}.{key}={count}")
            else:
                print(f"{name}={value}")
        if not report.dry_run:
            print(f"objectsWritten={report.written_objects}")
        return 0
    except PortabilityError as error:
        print(f"Refused: {error}", file=sys.stderr)
        return 2
    except (BadRequestError, PayloadTooLargeError) as error:
        print(f"Failed: {error.code}: {error}", file=sys.stderr)
        return 1
    except ValueError as error:
        print(f"Refused: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
