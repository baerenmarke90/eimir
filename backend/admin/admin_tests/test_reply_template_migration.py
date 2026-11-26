"""The reply template revision of the operator plugin chain (#2327).

Revision ``0002`` follows the ticket link revision and creates the operator's
reply templates. It references no table at all: templates are operator text and
belong to no report, Account or Space.
"""

from __future__ import annotations

import io
from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.plugin import plugin

from eimir.plugins.contract import MigrationSpec
from eimir.plugins.migrations import upgrade_chain
from tests.conftest import requires_database

VERSION_TABLE = "alembic_version_admin"
TABLE = "support_reply_templates"
TICKETS = "support_report_tickets"


def _spec() -> MigrationSpec:
    spec = plugin.migrations()
    assert spec is not None
    return spec


def _script() -> ScriptDirectory:
    config = Config()
    config.set_main_option("script_location", _spec().script_location)
    return ScriptDirectory.from_config(config)


def _render(*, down: bool = False) -> str:
    """The SQL of ``0001 -> 0002`` (or ``0002 -> 0001``) without a database."""
    script = _script()
    buffer = io.StringIO()

    def fn(revision: Any, context: MigrationContext) -> Any:
        if down:
            return script._downgrade_revs("0001", "0002")
        return script._upgrade_revs("0002", revision)

    context = MigrationContext.configure(
        dialect_name="postgresql",
        opts={
            "as_sql": True,
            "output_buffer": buffer,
            "fn": fn,
            "script": script,
            "version_table": VERSION_TABLE,
            "starting_rev": "0002" if down else "0001",
        },
    )
    with Operations.context(context), context.begin_transaction():
        context.run_migrations()
    return buffer.getvalue()


def test_the_revision_follows_the_ticket_revision_and_is_the_head() -> None:
    script = _script()

    assert script.get_heads() == ["0002"]
    assert script.get_revision("0002").down_revision == "0001"


def test_the_revision_creates_the_table_with_a_case_insensitive_unique_name() -> None:
    sql = _render()

    assert f"CREATE TABLE {TABLE}" in sql
    assert "name VARCHAR(40) NOT NULL" in sql
    assert "text VARCHAR(500) NOT NULL" in sql
    assert "CREATE UNIQUE INDEX uq_support_reply_templates_name_lower" in sql
    assert "lower(name)" in sql
    assert "REFERENCES" not in sql


def test_the_revision_downgrades_cleanly() -> None:
    sql = _render(down=True)

    assert f"DROP TABLE {TABLE}" in sql
    assert TICKETS not in sql


@pytest.mark.integration
@requires_database
def test_the_chain_matches_the_model(engine: Engine) -> None:
    from eimir.db.base import Base

    with engine.begin() as connection:
        connection.execute(text(f"DROP TABLE IF EXISTS {TABLE}"))
        connection.execute(text(f"DROP TABLE IF EXISTS {TICKETS}"))
        connection.execute(text(f"DROP TABLE IF EXISTS {VERSION_TABLE}"))
    try:
        with engine.connect() as connection:
            assert upgrade_chain(connection, "admin", _spec()) is True
            assert TABLE in inspect(connection).get_table_names()
            context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": True,
                    "include_object": lambda obj, name, type_, reflected, compare_to: (
                        name == TABLE if type_ == "table" else True
                    ),
                },
            )
            diff = [
                entry for entry in compare_metadata(context, Base.metadata) if TABLE in repr(entry)
            ]
            connection.rollback()
        assert diff == []
    finally:
        with engine.begin() as connection:
            connection.execute(text(f"DROP TABLE IF EXISTS {VERSION_TABLE}"))
        # The test engine created the tables from the model; put them back for the others.
        for name in (TICKETS, TABLE):
            Base.metadata.tables[name].create(engine, checkfirst=True)
