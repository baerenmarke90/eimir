"""Forward-migration regression test for existing installations after 0028."""

from __future__ import annotations

import os
from dataclasses import dataclass

import alembic.command
import alembic.config
import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Connection, Engine

from eimir.search.index_migration import SEARCH_INDEXES
from tests.conftest import requires_database

INVALID_INDEX_NAME = "ix_memories_search_fts"
MISSING_INDEX_NAME = "ix_wishes_search_fts"
VALID_INDEX_NAME = "ix_milestones_search_fts"


@dataclass(frozen=True)
class IndexState:
    oid: int
    valid: bool
    definition: str


def _current_revision(connection: Connection) -> str:
    return str(connection.execute(sa.text("SELECT version_num FROM alembic_version")).scalar_one())


def _index_state(connection: Connection, index_name: str) -> IndexState | None:
    row = connection.execute(
        sa.text(
            "SELECT pg_class.oid, pg_index.indisvalid, pg_get_indexdef(pg_class.oid) "
            "FROM pg_index "
            "JOIN pg_class ON pg_class.oid = pg_index.indexrelid "
            "JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace "
            "WHERE pg_namespace.nspname = current_schema() AND pg_class.relname = :name"
        ),
        {"name": index_name},
    ).one_or_none()
    if row is None:
        return None
    return IndexState(oid=row[0], valid=row[1], definition=row[2])


def _required_state(states: dict[str, IndexState | None], index_name: str) -> IndexState:
    state = states[index_name]
    assert state is not None, f"{index_name} is missing"
    return state


def _required_index_state(connection: Connection, index_name: str) -> IndexState:
    state = _index_state(connection, index_name)
    assert state is not None, f"{index_name} is missing"
    return state


@pytest.mark.integration
@requires_database
def test_0055_repairs_an_existing_database_after_0028(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_db_url = os.environ.get("EIMIR_TEST_DATABASE_URL")
    if test_db_url:
        monkeypatch.setenv("EIMIR_DATABASE_URL", test_db_url)
    config = alembic.config.Config("alembic.ini")

    # Begin from the real current migration head, then step back only across
    # the new no-op repair revision. At 0054, revision 0028 is already part of
    # the recorded linear history, matching an existing upgraded installation.
    alembic.command.upgrade(config, "head")
    alembic.command.downgrade(config, "0054")

    try:
        with engine.connect() as connection:
            assert _current_revision(connection) == "0054"
            baselines = {
                name: _index_state(connection, name)
                for name in (INVALID_INDEX_NAME, MISSING_INDEX_NAME, VALID_INDEX_NAME)
            }
        assert all(state is not None and state.valid for state in baselines.values())

        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(sa.text(f"DROP INDEX CONCURRENTLY {MISSING_INDEX_NAME}"))
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    "UPDATE pg_index SET indisvalid = false "
                    "WHERE indexrelid = CAST(:name AS regclass)"
                ),
                {"name": INVALID_INDEX_NAME},
            )

        with engine.connect() as connection:
            invalid_before = _index_state(connection, INVALID_INDEX_NAME)
            assert invalid_before is not None and invalid_before.valid is False
            assert _index_state(connection, MISSING_INDEX_NAME) is None

        # Execute only the new forward repair, not the historical 0028 revision.
        alembic.command.upgrade(config, "0055")

        with engine.connect() as connection:
            assert _current_revision(connection) == "0055"
            repaired = {
                index.name: _index_state(connection, index.name) for index in SEARCH_INDEXES
            }

        assert all(state is not None and state.valid for state in repaired.values())
        for name in (INVALID_INDEX_NAME, MISSING_INDEX_NAME, VALID_INDEX_NAME):
            baseline = _required_state(baselines, name)
            state = _required_state(repaired, name)
            assert state.definition == baseline.definition

        assert (
            _required_state(repaired, INVALID_INDEX_NAME).oid
            != _required_state(baselines, INVALID_INDEX_NAME).oid
        )
        assert (
            _required_state(repaired, MISSING_INDEX_NAME).oid
            != _required_state(baselines, MISSING_INDEX_NAME).oid
        )
        assert (
            _required_state(repaired, VALID_INDEX_NAME).oid
            == _required_state(baselines, VALID_INDEX_NAME).oid
        )

        # A restarted/repeated repair sees only valid indexes and leaves their
        # physical objects intact rather than rebuilding them unnecessarily.
        repaired_oids = {name: state.oid for name, state in repaired.items() if state is not None}
        alembic.command.downgrade(config, "0054")
        alembic.command.upgrade(config, "0055")
        with engine.connect() as connection:
            repeated_oids = {
                index.name: _required_index_state(connection, index.name).oid
                for index in SEARCH_INDEXES
            }
        assert repeated_oids == repaired_oids
    finally:
        alembic.command.upgrade(config, "head")
