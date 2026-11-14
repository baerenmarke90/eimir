"""Migration 0127 keeps existing data valid and its downgrade restores the single selection."""

from __future__ import annotations

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from eimir.authorization import PrivacyClass
from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
)
from eimir.dashboard.models import DashboardModulePreference
from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_upgrade_copies_the_single_selection_and_downgrade_restores_it(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    first = Collection(
        space_id=space.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=CollectionPayload(title="Einkauf"),
    )
    second = Collection(
        space_id=space.id,
        owner_id=account.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=CollectionPayload(title="Packliste"),
    )
    session.add_all([first, second])
    session.flush()
    item = CollectionItem(
        collection_id=first.id,
        created_by=account.id,
        completed=True,
        position=0,
        payload=CollectionItemPayload(title="Milch"),
    )
    preference = DashboardModulePreference(
        account_id=account.id,
        space_id=space.id,
        module_key="pinned_collection",
        selected_collection_id=first.id,
    )
    session.add_all([item, preference])
    session.flush()
    first_id, second_id, preference_id = first.id, second.id, preference.id

    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0127").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        # Start from the schema as it was before 0127, with the data in place.
        migration.downgrade()
        session.execute(
            text(
                "UPDATE dashboard_module_preferences SET selected_collection_id = :id WHERE id = :p"
            ),
            {"id": first_id, "p": preference_id},
        )

        migration.upgrade()
        rows = session.execute(
            text(
                "SELECT collection_id, position FROM dashboard_module_collections "
                "WHERE preference_id = :p ORDER BY position"
            ),
            {"p": preference_id},
        ).all()
        assert [(row.collection_id, row.position) for row in rows] == [(first_id, 0)]
        kinds = (
            session.execute(
                text("SELECT kind FROM collections WHERE id IN (:a, :b)"),
                {"a": first_id, "b": second_id},
            )
            .scalars()
            .all()
        )
        assert kinds == ["GENERIC", "GENERIC"]
        completion = session.execute(
            text("SELECT completed, completed_by, completed_at FROM collection_items")
        ).one()
        assert completion.completed is True
        assert completion.completed_by is None
        assert completion.completed_at is None

        # A person who selected several lists: the first one comes back on downgrade.
        session.execute(
            text(
                "INSERT INTO dashboard_module_collections (preference_id, collection_id, position) "
                "VALUES (:p, :c, 1)"
            ),
            {"p": preference_id, "c": second_id},
        )
        session.execute(
            text(
                "UPDATE dashboard_module_preferences "
                "SET selected_collection_id = NULL WHERE id = :p"
            ),
            {"p": preference_id},
        )
        migration.downgrade()
        restored = session.execute(
            text("SELECT selected_collection_id FROM dashboard_module_preferences WHERE id = :p"),
            {"p": preference_id},
        ).scalar_one()
        assert restored == first_id
        assert (
            session.execute(
                text(
                    "SELECT count(*) FROM information_schema.columns "
                    "WHERE table_name = 'collections' AND column_name = 'kind'"
                )
            ).scalar_one()
            == 0
        )
        migration.upgrade()
