"""Migration 0172 adds support reports, their reply and the reply notice (#2189)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from eimir.db.base import Base
from eimir.engagement.models import Notification, NotificationPreference
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

TABLES = {"support_reports", "support_report_replies"}


def _tables(session) -> set[str]:  # type: ignore[no-untyped-def]
    return set(inspect(session.connection()).get_table_names())


def _notice(space_id, account_id) -> Notification:  # type: ignore[no-untyped-def]
    return Notification(
        space_id=space_id,
        recipient_account_id=account_id,
        source_event_id=uuid4(),
        kind="SUPPORT_REPLY",
        target_type="SUPPORT_REPORT",
        target_id=uuid4(),
    )


def test_support_reports_upgrade_and_rollback(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration reporter")
    space = make_space(session, account)
    existing = NotificationPreference(
        account_id=account.id, kind="REMINDER_DUE", channel="PUSH", enabled=False
    )
    session.add(existing)
    session.flush()
    assert _tables(session) >= TABLES
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0172").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        session.add(_notice(space.id, account.id))
        session.add(
            NotificationPreference(
                account_id=account.id, kind="SUPPORT_REPLY", channel="PUSH", enabled=False
            )
        )
        session.flush()

        # The downgrade removes the new notices and preferences before the catalog.
        migration.downgrade()
        assert not TABLES & _tables(session)
        with pytest.raises(IntegrityError), session.begin_nested():
            session.add(_notice(space.id, account.id))
            session.flush()

        migration.upgrade()
        assert _tables(session) >= TABLES
        session.add(_notice(space.id, account.id))
        session.flush()
        replies = inspect(session.connection()).get_foreign_keys("support_report_replies")
        assert [(key["referred_table"], key["options"].get("ondelete")) for key in replies] == [
            ("support_reports", "CASCADE")
        ]
    session.refresh(existing)
    assert existing.enabled is False
