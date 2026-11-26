"""The operator plugin's migration chain (#2189; Decision 0017, decision 6).

The chain has its own version table, references only Core tables and creates the
ticket link table. The offline tests render the SQL without a database; the
integration test runs the chain on PostgreSQL and compares it with the model.
"""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, inspect, text

pytest.importorskip("eimir_admin", reason="the eimir-admin distribution is not installed")

from eimir_admin.plugin import plugin

from eimir.plugins.contract import MigrationSpec
from eimir.plugins.migrations import upgrade_chain
from tests.conftest import requires_database

VERSION_TABLE = "alembic_version_admin"
TABLE = "support_report_tickets"
# The later revision of the same chain; the full-chain upgrade creates it too.
TEMPLATES = "support_reply_templates"


def _spec() -> MigrationSpec:
    spec = plugin.migrations()
    assert spec is not None
    return spec


def _script() -> ScriptDirectory:
    config = Config()
    config.set_main_option("script_location", _spec().script_location)
    return ScriptDirectory.from_config(config)


def _render(*, down: bool = False) -> str:
    script = _script()
    buffer = io.StringIO()

    def fn(revision: Any, context: MigrationContext) -> Any:
        if down:
            return script._downgrade_revs("base", "0001")
        return script._upgrade_revs("heads", revision)

    context = MigrationContext.configure(
        dialect_name="postgresql",
        opts={
            "as_sql": True,
            "output_buffer": buffer,
            "fn": fn,
            "script": script,
            "version_table": VERSION_TABLE,
            "starting_rev": "0001" if down else None,
        },
    )
    from alembic.operations import Operations

    with Operations.context(context), context.begin_transaction():
        context.run_migrations()
    return buffer.getvalue()


def test_the_chain_is_absolute_has_its_own_version_table_and_one_head() -> None:
    spec = _spec()

    assert Path(spec.script_location).is_absolute()
    assert (Path(spec.script_location) / "versions").is_dir()
    assert spec.version_table == VERSION_TABLE
    script = _script()
    # One head; the reply template revision ``0002`` follows this one (#2327).
    assert len(script.get_heads()) == 1
    assert script.get_revision("0001").down_revision is None


def test_the_revision_creates_the_table_with_its_constraints() -> None:
    sql = _render()

    assert f"CREATE TABLE {TABLE}" in sql
    assert "REFERENCES support_reports (id) ON DELETE CASCADE" in sql
    assert "uq_support_report_tickets_report_id" in sql
    assert "ck_support_report_tickets_state_allowed" in sql
    assert f"CREATE TABLE {VERSION_TABLE}" in sql


def test_the_revision_references_core_tables_only() -> None:
    sql = _render()

    assert set(re.findall(r"REFERENCES (\w+)", sql)) == {"support_reports"}


def test_the_revision_downgrades_cleanly() -> None:
    assert f"DROP TABLE {TABLE}" in _render(down=True)


@pytest.mark.integration
@requires_database
def test_the_chain_matches_the_model(engine: Engine) -> None:
    from eimir.db.base import Base

    with engine.begin() as connection:
        connection.execute(text(f"DROP TABLE IF EXISTS {TABLE}"))
        connection.execute(text(f"DROP TABLE IF EXISTS {TEMPLATES}"))
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
        for name in (TABLE, TEMPLATES):
            Base.metadata.tables[name].create(engine, checkfirst=True)
