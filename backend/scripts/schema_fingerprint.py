"""Fingerprint of the migrated database schema (Decision 0017, Phase 2, #2182).

Moving the Pro code into its own distribution must not change the schema a
fresh database reaches. CI migrates an empty database with and without the
plugin and compares the result with the committed fingerprint of the head.

The fingerprint is read from the PostgreSQL catalog of the ``public`` schema:
every table with its columns (type, nullability, default), every constraint
in its ``pg_get_constraintdef`` form, every index in its ``pg_get_indexdef``
form and every enum type with its labels. Alembic version tables are left
out: they describe the migration state, not the schema.

Usage, with ``EIMIR_DATABASE_URL`` pointing at a migrated database::

    python -m scripts.schema_fingerprint write   # update the committed file
    python -m scripts.schema_fingerprint check   # fail on any difference
"""

from __future__ import annotations

import argparse
import difflib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import Connection, create_engine, text

from eimir.config import DatabaseSettings

FINGERPRINT = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "schema_fingerprint.json"

_VERSION_TABLES = "alembic_version%"

_COLUMNS = text(
    """
    SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull,
           pg_get_expr(d.adbin, d.adrelid), a.attidentity, a.attgenerated
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND a.attnum > 0
      AND NOT a.attisdropped AND c.relname NOT LIKE :version_tables
    ORDER BY c.relname, a.attname
    """
)

_CONSTRAINTS = text(
    """
    SELECT c.relname, con.conname, con.contype, pg_get_constraintdef(con.oid, true)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname NOT LIKE :version_tables
    ORDER BY c.relname, con.conname
    """
)

_INDEXES = text(
    """
    SELECT tablename, indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public' AND tablename NOT LIKE :version_tables
    ORDER BY tablename, indexname
    """
)

_ENUMS = text(
    """
    SELECT t.typname, e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY t.typname, e.enumsortorder
    """
)


def fingerprint(connection: Connection) -> dict[str, Any]:
    """Return the schema of ``public`` as a deterministic, JSON-ready mapping."""
    parameters = {"version_tables": _VERSION_TABLES}
    tables: dict[str, dict[str, Any]] = {}

    def table(name: str) -> dict[str, Any]:
        return tables.setdefault(name, {"columns": {}, "constraints": {}, "indexes": {}})

    for name, column, type_, not_null, default, identity, generated in connection.execute(
        _COLUMNS, parameters
    ):
        table(name)["columns"][column] = {
            "type": type_,
            "nullable": not not_null,
            "default": default,
            "identity": identity or None,
            "generated": generated or None,
        }
    for name, constraint, kind, definition in connection.execute(_CONSTRAINTS, parameters):
        table(name)["constraints"][constraint] = {"kind": kind, "definition": definition}
    for name, index, definition in connection.execute(_INDEXES, parameters):
        table(name)["indexes"][index] = definition
    enums: dict[str, list[str]] = {}
    for name, label in connection.execute(_ENUMS):
        enums.setdefault(name, []).append(label)
    return {"tables": dict(sorted(tables.items())), "enums": dict(sorted(enums.items()))}


def canonical(document: dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def differences(expected: str, actual: str) -> str:
    return "".join(
        difflib.unified_diff(
            expected.splitlines(keepends=True),
            actual.splitlines(keepends=True),
            fromfile="committed fingerprint",
            tofile="migrated database",
        )
    )


def _current() -> str:
    engine = create_engine(DatabaseSettings().database_url, future=True)
    try:
        with engine.connect() as connection:
            return canonical(fingerprint(connection))
    finally:
        engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("command", choices=("write", "check"))
    arguments = parser.parse_args()
    actual = _current()
    if arguments.command == "write":
        FINGERPRINT.write_text(actual, encoding="utf-8", newline="\n")
        return
    expected = FINGERPRINT.read_text(encoding="utf-8")
    if expected != actual:
        raise SystemExit(
            "The migrated schema differs from the committed fingerprint "
            f"({FINGERPRINT.name}). A new migration must update it with "
            "`python -m scripts.schema_fingerprint write`.\n" + differences(expected, actual)
        )
    print(f"Schema matches {FINGERPRINT.name}.")


if __name__ == "__main__":
    main()
