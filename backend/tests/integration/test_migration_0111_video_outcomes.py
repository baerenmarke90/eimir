"""The additive video outcome migration keeps pre-existing notification choices."""

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


def test_video_outcome_upgrade_and_rollback_preserve_existing_choices(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    existing = NotificationPreference(
        account_id=account.id, kind="REMINDER_DUE", channel="PUSH", enabled=False
    )
    session.add(existing)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0111").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        with pytest.raises(IntegrityError), session.begin_nested():
            session.add(
                NotificationPreference(
                    account_id=account.id,
                    kind="VIDEO_PROCESSING_FAILED",
                    channel="PUSH",
                    enabled=True,
                )
            )
            session.flush()
        migration.upgrade()
        assert "failed_media_purged_at" in {
            column["name"] for column in inspect(session.connection()).get_columns("attachments")
        }
        preference = NotificationPreference(
            account_id=account.id, kind="VIDEO_PROCESSING_FAILED", channel="PUSH", enabled=True
        )
        session.add(preference)
        notification = Notification(
            space_id=space.id,
            recipient_account_id=account.id,
            source_event_id=uuid4(),
            kind="VIDEO_PROCESSING_FAILED",
        )
        session.add(notification)
        session.flush()
        migration.downgrade()
        session.refresh(existing)
        assert existing.enabled is False
        migration.upgrade()
