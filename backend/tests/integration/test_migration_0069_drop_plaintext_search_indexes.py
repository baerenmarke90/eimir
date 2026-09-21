"""Revision 0069 removes the plaintext-derived Search indexes (issue #797).

The 0028 indexes hold tokenized protected text. They must not exist at head, and
the migration must be re-runnable after an interrupted rollout.
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


def _existing(engine: Engine) -> set[str]:
    with engine.connect() as connection:
        rows = connection.execute(
            sa.text(
                "SELECT indexname FROM pg_indexes "
                "WHERE schemaname = current_schema() AND indexname LIKE '%\\_search\\_fts'"
            )
        )
        return {row[0] for row in rows}


@pytest.mark.integration
@requires_database
def test_head_has_no_plaintext_search_index_and_downgrade_restores_the_history(
    engine: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    test_db_url = os.environ.get("EIMIR_TEST_DATABASE_URL")
    if test_db_url:
        monkeypatch.setenv("EIMIR_DATABASE_URL", test_db_url)
    config = alembic.config.Config("alembic.ini")

    try:
        alembic.command.downgrade(config, "0068")
        assert _existing(engine) == {index.name for index in SEARCH_INDEXES}

        alembic.command.upgrade(config, "0069")
        assert _existing(engine) == set()

        # Re-running after an interrupted rollout is harmless.
        alembic.command.downgrade(config, "0068")
        alembic.command.upgrade(config, "head")
        assert _existing(engine) == set()
    finally:
        alembic.command.upgrade(config, "head")
