"""Migration 0131 turns stored "warm" Wir designs into the new "connected" default."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import text

from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

_INSERT_EXPLICIT = text(
    "INSERT INTO app_icon_preferences (id, account_id, space_id, icon_id, wir_design, version) "
    "VALUES (:id, :account, :space, 'original', :design, 3)"
)
_INSERT_DEFAULTED = text(
    "INSERT INTO app_icon_preferences (id, account_id, space_id, icon_id, version) "
    "VALUES (:id, :account, :space, 'original', 1)"
)


def _designs(session, accounts) -> dict[str, tuple[str, int]]:  # type: ignore[no-untyped-def]
    # Keyed by the test's own label for each account: the name of an account is
    # protected content and no longer readable in SQL (#797).
    labels = {account.id: label for label, account in accounts.items()}
    rows = session.execute(
        text("SELECT account_id, wir_design, version FROM app_icon_preferences")
    ).all()
    return {labels[account_id]: (design, version) for account_id, design, version in rows}


def _server_default(session) -> str:  # type: ignore[no-untyped-def]
    return str(
        session.execute(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name = 'app_icon_preferences' AND column_name = 'wir_design'"
            )
        ).scalar_one()
    )


def test_warm_becomes_connected_and_paid_choices_survive_the_round_trip(session):  # type: ignore[no-untyped-def]
    owner = make_account(session, "Owner")
    space = make_space(session, owner)
    accounts = {
        name: make_account(session, name) for name in ("Warm", "Modern", "Classic", "Defaulted")
    }
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0131").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert "warm" in _server_default(session)
        for name in ("Warm", "Modern", "Classic"):
            session.execute(
                _INSERT_EXPLICIT,
                {
                    "id": uuid4(),
                    "account": accounts[name].id,
                    "space": space.id,
                    "design": name.lower(),
                },
            )
        session.execute(
            _INSERT_DEFAULTED,
            {"id": uuid4(), "account": accounts["Defaulted"].id, "space": space.id},
        )
        assert _designs(session, accounts)["Defaulted"] == ("warm", 1)

        migration.upgrade()
        # Versions stay untouched so existing concurrency tokens remain valid.
        assert _designs(session, accounts) == {
            "Warm": ("connected", 3),
            "Modern": ("modern", 3),
            "Classic": ("classic", 3),
            "Defaulted": ("connected", 1),
        }
        assert "connected" in _server_default(session)

        migration.downgrade()
        assert _designs(session, accounts) == {
            "Warm": ("warm", 3),
            "Modern": ("modern", 3),
            "Classic": ("classic", 3),
            "Defaulted": ("warm", 1),
        }
        assert "warm" in _server_default(session)
        migration.upgrade()
