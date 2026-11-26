"""The first Pro migration chain (ServerAdmin part 5; Decision 0017, decision 6).

The chain has its own version table, references only Core tables and creates the
two gift code tables. The offline tests render the SQL without a database; the
integration tests run the chain on PostgreSQL and compare it with the models.
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
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from eimir_pro.plugin import plugin
from sqlalchemy import Engine, inspect, text

from eimir.plugins.contract import MigrationSpec
from eimir.plugins.migrations import upgrade_chain, upgrade_plugin_chains
from tests.conftest import requires_database

BACKEND = Path(__file__).resolve().parents[3]
VERSION_TABLE = "alembic_version_pro"
TABLES = ("gift_code_batches", "gift_codes")


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
    with Operations.context(context), context.begin_transaction():
        context.run_migrations()
    return buffer.getvalue()


def test_the_chain_is_absolute_has_its_own_version_table_and_one_head() -> None:
    spec = _spec()

    assert Path(spec.script_location).is_absolute()
    assert (Path(spec.script_location) / "versions").is_dir()
    assert spec.version_table == VERSION_TABLE
    script = _script()
    assert script.get_heads() == ["0001"]
    assert script.get_revision("0001").down_revision is None


def test_the_revision_creates_both_tables_with_their_constraints() -> None:
    sql = _render()

    for table in TABLES:
        assert f"CREATE TABLE {table}" in sql
    assert "REFERENCES gift_code_batches (id) ON DELETE CASCADE" in sql
    assert "REFERENCES spaces (id) ON DELETE SET NULL" in sql
    assert "REFERENCES entitlement_grants (id) ON DELETE SET NULL" in sql
    assert "uq_gift_codes_lookup_hash" in sql
    assert "ck_gift_code_batches_duration_months_allowed" in sql
    assert "ck_gift_codes_not_redeemed_and_revoked" in sql
    assert f"CREATE TABLE {VERSION_TABLE}" in sql


def test_the_revision_references_core_tables_and_its_own_batch_only() -> None:
    sql = _render()

    assert set(re.findall(r"REFERENCES (\w+)", sql)) == {
        "accounts",
        "spaces",
        "entitlement_grants",
        "gift_code_batches",
    }


def test_the_revision_downgrades_cleanly() -> None:
    sql = _render(down=True)

    assert sql.index("DROP TABLE gift_codes") < sql.index("DROP TABLE gift_code_batches")


def test_no_core_revision_knows_the_gift_code_tables() -> None:
    """A Core-only ``migrate`` never creates them: only the Pro chain does."""
    versions = BACKEND / "alembic" / "versions"
    assert versions.is_dir()
    for revision in versions.glob("*.py"):
        assert "gift_code" not in revision.read_text(encoding="utf-8"), revision.name


def _drop(engine: Engine) -> None:
    with engine.begin() as connection:
        for table in reversed(TABLES):
            connection.execute(text(f"DROP TABLE IF EXISTS {table}"))
        connection.execute(text(f"DROP TABLE IF EXISTS {VERSION_TABLE}"))


def _restore(engine: Engine) -> None:
    from eimir.db.base import Base

    # Keep the chain recorded as applied, so a later ``alembic upgrade head`` in
    # another test does not create the tables in the shared test database, where
    # they would block Core downgrades past their parent tables.
    with engine.begin() as connection:
        for table in reversed(TABLES):
            connection.execute(text(f"DROP TABLE IF EXISTS {table}"))
    # The module fixture created the tables from the models; put them back for the others.
    Base.metadata.create_all(engine, tables=[Base.metadata.tables[name] for name in TABLES])


@pytest.mark.integration
@requires_database
def test_a_core_only_migrate_never_creates_the_tables(engine: Engine) -> None:
    _drop(engine)
    try:
        with engine.connect() as connection:
            # Core-only: no plugin is loaded, so no plugin chain runs.
            assert upgrade_plugin_chains(connection, []) == []
            names = set(inspect(connection).get_table_names())
        assert names.isdisjoint({*TABLES, VERSION_TABLE})
    finally:
        with engine.connect() as connection:
            upgrade_chain(connection, "pro", _spec())
        _restore(engine)


@pytest.mark.integration
@requires_database
def test_the_chain_upgrades_into_its_own_version_table_and_matches_the_models(
    engine: Engine,
) -> None:
    from eimir.db.base import Base

    _drop(engine)
    try:
        with engine.connect() as connection:
            assert upgrade_plugin_chains(connection, [plugin]) == ["pro"]
            assert set(TABLES) <= set(inspect(connection).get_table_names())
            assert connection.execute(
                text(f"SELECT version_num FROM {VERSION_TABLE}")
            ).scalars().all() == ["0001"]
            context = MigrationContext.configure(
                connection,
                opts={
                    "compare_type": True,
                    "include_object": lambda obj, name, type_, reflected, compare_to: (
                        name in TABLES if type_ == "table" else True
                    ),
                },
            )
            diff = [
                entry
                for entry in compare_metadata(context, Base.metadata)
                if any(table in repr(entry) for table in TABLES)
            ]
            connection.rollback()
        assert diff == []
    finally:
        _restore(engine)


@pytest.mark.integration
@requires_database
def test_the_chain_downgrades_and_drops_both_tables(engine: Engine) -> None:
    _drop(engine)
    try:
        with engine.connect() as connection:
            assert upgrade_chain(connection, "pro", _spec()) is True
            script = _script()

            def downgrade(revision: Any, context: MigrationContext) -> Any:
                return script._downgrade_revs("base", revision)

            with connection.begin():
                context = MigrationContext.configure(
                    connection,
                    opts={"version_table": VERSION_TABLE, "fn": downgrade, "script": script},
                )
                with Operations.context(context):
                    context.run_migrations()
            assert set(inspect(connection).get_table_names()).isdisjoint(TABLES)
    finally:
        with engine.connect() as connection:
            upgrade_chain(connection, "pro", _spec())
        _restore(engine)
