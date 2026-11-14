"""Migration 0128 admits the COLLECTION_ITEM receipt type; its downgrade removes those receipts."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

_INSERT = text(
    "INSERT INTO create_receipts "
    "(id, space_id, account_id, resource_type, idempotency_key, request_fingerprint) "
    "VALUES (:id, :space, :account, :type, :key, repeat('a', 64))"
)


def _insert(session, space_id, account_id, resource_type: str) -> None:  # type: ignore[no-untyped-def]
    session.execute(
        _INSERT,
        {
            "id": uuid4(),
            "space": space_id,
            "account": account_id,
            "type": resource_type,
            "key": uuid4(),
        },
    )


def test_the_new_type_is_allowed_after_upgrade_and_removed_on_downgrade(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0128").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        with pytest.raises(IntegrityError), session.begin_nested():
            _insert(session, space.id, account.id, "COLLECTION_ITEM")

        # A receipt of an older type survives the round trip.
        _insert(session, space.id, account.id, "WISH")

        migration.upgrade()
        _insert(session, space.id, account.id, "COLLECTION_ITEM")
        counts = dict(
            session.execute(
                text("SELECT resource_type, count(*) FROM create_receipts GROUP BY resource_type")
            ).all()
        )
        assert counts == {"WISH": 1, "COLLECTION_ITEM": 1}

        migration.downgrade()
        counts = dict(
            session.execute(
                text("SELECT resource_type, count(*) FROM create_receipts GROUP BY resource_type")
            ).all()
        )
        assert counts == {"WISH": 1}
        migration.upgrade()
