"""Real Alembic migration lifecycle test for revision 0028 (search indexes).

`CREATE INDEX CONCURRENTLY IF NOT EXISTS` only checks whether the index
*name* already exists, not whether it is valid. If a previous attempt at
this migration was interrupted mid-build (a killed `migrate` container, a
host restart, a deploy timeout), PostgreSQL leaves that one index cataloged
but invalid, and a bare retry would see the name and silently skip rebuilding
it -- forever, with no error and no operator-visible signal. This simulates
exactly that: one index is left behind in the invalid state a real
interrupted `CREATE INDEX CONCURRENTLY` produces, then the real migration is
re-run to prove it detects and repairs it instead of leaving it broken.
"""

from __future__ import annotations

import os

import alembic.command
import alembic.config
import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Engine

from eimir.search.index_migration import SEARCH_INDEXES
from tests.conftest import requires_database

INDEX_NAME = "ix_memories_search_fts"
MEMORY_INDEX = next(index for index in SEARCH_INDEXES if index.name == INDEX_NAME)


def _is_valid(conn: sa.Connection, index_name: str) -> bool | None:
    return conn.execute(
        sa.text(
            "SELECT indisvalid FROM pg_index "
            "JOIN pg_class ON pg_class.oid = pg_index.indexrelid "
            "JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace "
            "WHERE pg_namespace.nspname = current_schema() AND pg_class.relname = :name"
        ),
        {"name": index_name},
    ).scalar_one_or_none()


@pytest.mark.integration
@requires_database
def test_real_alembic_migration_0028_repairs_an_interrupted_concurrent_index(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_db_url = os.environ.get("EIMIR_TEST_DATABASE_URL")
    if test_db_url:
        monkeypatch.setenv("EIMIR_DATABASE_URL", test_db_url)
    config = alembic.config.Config("alembic.ini")

    alembic.command.downgrade(config, "0027")

    try:
        # Simulate what a previous attempt interrupted mid-build leaves
        # behind: the index exists (under the exact name/definition the
        # migration would create) but is marked invalid by PostgreSQL.
        # CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(
                sa.text(
                    f"CREATE INDEX CONCURRENTLY {MEMORY_INDEX.name} "
                    f"ON {MEMORY_INDEX.table} USING gin (({MEMORY_INDEX.expression}))"
                )
            )
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "UPDATE pg_index SET indisvalid = false "
                    "WHERE indexrelid = CAST(:name AS regclass)"
                ),
                {"name": INDEX_NAME},
            )
        with engine.connect() as conn:
            assert _is_valid(conn, INDEX_NAME) is False

        # The real migration must detect the invalid leftover, drop it, and
        # rebuild it -- not silently skip it because the name already exists.
        alembic.command.upgrade(config, "0028")

        with engine.connect() as conn:
            for index in SEARCH_INDEXES:
                assert _is_valid(conn, index.name) is True, f"{index.name} missing or still invalid"
    finally:
        alembic.command.upgrade(config, "head")
