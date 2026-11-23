"""The tool runs only against the Alembic revision it was verified against (Decision 0020)."""

from __future__ import annotations

from pathlib import Path

import pytest
from eimir_pro.portability.schema_guard import (
    TESTED_ALEMBIC_REVISION,
    SchemaRevisionError,
    database_revision,
    require_tested_revision,
)
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session


def _session(*revisions: str | None) -> Session:
    """An in-memory database; ``None`` for no version table at all."""
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        if revisions != (None,):
            connection.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32))"))
            for revision in revisions:
                connection.execute(
                    text("INSERT INTO alembic_version VALUES (:revision)"), {"revision": revision}
                )
    return Session(engine)


def test_the_tested_revision_passes_and_is_returned() -> None:
    with _session(TESTED_ALEMBIC_REVISION) as session:
        assert require_tested_revision(session, role="source") == TESTED_ALEMBIC_REVISION


@pytest.mark.parametrize("role", ["source", "target"])
def test_another_revision_is_refused_and_named(role: str) -> None:
    with _session("0001") as session, pytest.raises(SchemaRevisionError) as caught:
        require_tested_revision(session, role=role)
    message = str(caught.value)
    assert role in message
    assert "0001" in message
    assert TESTED_ALEMBIC_REVISION in message


def test_a_database_that_was_never_migrated_is_refused() -> None:
    with _session(None) as session:
        assert database_revision(session) is None
        with pytest.raises(SchemaRevisionError):
            require_tested_revision(session, role="target")


def test_an_empty_version_table_is_refused() -> None:
    with _session() as session:
        assert database_revision(session) is None
        with pytest.raises(SchemaRevisionError):
            require_tested_revision(session, role="target")


def test_several_revisions_are_refused() -> None:
    with (
        _session(TESTED_ALEMBIC_REVISION, "0001") as session,
        pytest.raises(SchemaRevisionError),
    ):
        database_revision(session)


def test_the_tested_revision_is_the_head_of_the_core_migration_chain() -> None:
    """A Core migration makes this fail until the tool is re-verified and the pin moved.

    The importer writes column by column into Core tables, so a migration can break export or
    import without any other test noticing. Re-run the probe tests against the new schema,
    then set ``TESTED_ALEMBIC_REVISION`` to the new head.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config_path = Path(__file__).resolve().parents[3] / "alembic.ini"
    if not config_path.exists():
        pytest.skip("The Core migration scripts are not part of this checkout.")
    config = Config(str(config_path))
    config.set_main_option("script_location", str(config_path.parent / "alembic"))
    heads = set(ScriptDirectory.from_config(config).get_heads())
    assert heads == {TESTED_ALEMBIC_REVISION}
