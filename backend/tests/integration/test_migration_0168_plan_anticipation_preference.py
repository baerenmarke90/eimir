"""Migration 0168 turns the countdown opt-in into a three-state preference (#2158 D)."""

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

_PLAN = text(
    "INSERT INTO plans (id, space_id, owner_id, privacy_class, status, payload, version, "
    "crypto_version, anticipation_enabled, planned_on) VALUES (:id, :space, :owner, "
    "'SPACE_SHARED', 'PLANNED', CAST('{}' AS jsonb), 1, 0, :flag, DATE '2099-01-01')"
)


def _columns(session) -> set[str]:  # type: ignore[no-untyped-def]
    return {column["name"] for column in inspect(session.connection()).get_columns("plans")}


def test_pinned_plans_stay_pinned_and_unchosen_plans_become_automatic(session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    space = make_space(session, anna)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0168").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        assert "anticipation" not in _columns(session)
        pinned, unchosen = uuid4(), uuid4()
        for plan_id, flag in ((pinned, True), (unchosen, False)):
            session.execute(
                _PLAN, {"id": plan_id, "space": space.id, "owner": anna.id, "flag": flag}
            )

        migration.upgrade()

        assert "anticipation_enabled" not in _columns(session)
        preferences = dict(session.execute(text("SELECT id, anticipation FROM plans")).all())
        assert preferences == {pinned: "ALWAYS", unchosen: "AUTOMATIC"}
        with pytest.raises(IntegrityError), session.begin_nested():
            session.execute(
                text("UPDATE plans SET anticipation = 'SOMETIMES' WHERE id = :id"),
                {"id": pinned},
            )
        session.execute(
            text("UPDATE plans SET anticipation = 'NEVER' WHERE id = :id"), {"id": unchosen}
        )

        # Downgrade keeps what the earlier code showed: only a pin is true.
        migration.downgrade()
        flags = dict(session.execute(text("SELECT id, anticipation_enabled FROM plans")).all())
        assert flags == {pinned: True, unchosen: False}
        migration.upgrade()
        assert "anticipation" in _columns(session)
