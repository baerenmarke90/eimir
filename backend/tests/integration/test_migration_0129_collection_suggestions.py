"""Migration 0129 creates the shopping suggestions table; its downgrade removes it again."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

_COLLECTION = text(
    "INSERT INTO collections (id, space_id, owner_id, privacy_class, kind, payload, version) "
    "VALUES (:id, :space, :owner, 'SPACE_SHARED', 'SHOPPING', CAST(:payload AS jsonb), 1)"
)
_SUGGESTION = text(
    "INSERT INTO collection_suggestions "
    "(id, collection_id, payload, last_bought_at, times_bought) "
    "VALUES (:id, :collection, CAST(:payload AS jsonb), now(), :times)"
)


def test_the_table_is_created_by_upgrade_removed_by_downgrade_and_follows_its_list(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0129").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert not inspect(session.connection()).has_table("collection_suggestions")

        migration.upgrade()
        assert inspect(session.connection()).has_table("collection_suggestions")

        collection_id = uuid4()
        session.execute(
            _COLLECTION,
            {
                "id": collection_id,
                "space": space.id,
                "owner": account.id,
                "payload": '{"title": "Einkauf"}',
            },
        )
        session.execute(
            _SUGGESTION,
            {
                "id": uuid4(),
                "collection": collection_id,
                "payload": '{"title": "Milch"}',
                "times": 1,
            },
        )
        # A suggestion is bought at least once.
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(
                _SUGGESTION,
                {
                    "id": uuid4(),
                    "collection": collection_id,
                    "payload": '{"title": "Brot"}',
                    "times": 0,
                },
            )
        # It disappears with its list.
        session.execute(text("DELETE FROM collections WHERE id = :id"), {"id": collection_id})
        assert session.execute(text("SELECT count(*) FROM collection_suggestions")).scalar() == 0

        migration.downgrade()
        assert not inspect(session.connection()).has_table("collection_suggestions")
        migration.upgrade()
