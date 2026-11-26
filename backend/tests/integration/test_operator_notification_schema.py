"""Operator notifications: ServerAdmin alerts that belong to no Space (#2314 part 2b)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.administration import service as administration
from eimir.administration.models import AdministrationSetting
from eimir.db.base import Base
from eimir.engagement.models import Notification, NotificationKind
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _row(account_id, *, kind="OPERATOR_ALERT", space_id=None, topic="failed_jobs"):  # type: ignore[no-untyped-def]
    return Notification(
        space_id=space_id,
        recipient_account_id=account_id,
        source_event_id=uuid4(),
        kind=kind,
        operator_topic=topic,
        in_app_visible=False,
    )


def _rejected(session: Session, row: Notification) -> None:
    with pytest.raises(IntegrityError), session.begin_nested():
        session.add(row)
        session.flush()


def test_operator_row_requires_no_space_and_a_topic(session: Session) -> None:
    account = make_account(session, "Operator")
    space = make_space(session, account)

    session.add(_row(account.id))
    session.flush()

    # A couple notice always belongs to a Space and never carries a topic.
    _rejected(session, _row(account.id, kind="REMINDER_DUE", topic=None))
    _rejected(session, _row(account.id, kind="REMINDER_DUE", space_id=space.id))
    # An operator notice never belongs to a Space and always names its topic.
    _rejected(session, _row(account.id, topic=None))
    _rejected(session, _row(account.id, space_id=space.id))
    _rejected(session, _row(account.id, topic="something_else"))


def test_every_alert_topic_is_accepted(session: Session) -> None:
    account = make_account(session, "Operator")
    for topic in (
        "failed_jobs",
        "space_quota_pressure",
        "disk_pressure",
        "delivery_failures",
        "backup_not_configured",
        "support_reports",
    ):
        session.add(_row(account.id, topic=topic))
    session.flush()


def test_operator_kind_is_in_the_catalog() -> None:
    assert NotificationKind.OPERATOR_ALERT.value == "OPERATOR_ALERT"


def test_monitoring_push_setting_defaults_on_and_is_audited(session: Session) -> None:
    assert administration.get_settings(session).monitoring_push_enabled is True
    actor = make_account(session, "Operator")

    administration.update_setting(
        session,
        actor_id=actor.id,
        setting=AdministrationSetting.MONITORING_PUSH_ENABLED,
        enabled=False,
    )

    assert administration.get_settings(session).monitoring_push_enabled is False
    # The mail switch is independent of the push switch.
    assert administration.get_settings(session).monitoring_alerts_enabled is True


def test_operator_notifications_upgrade_and_rollback(session: Session) -> None:
    account = make_account(session, "Migration operator")
    space = make_space(session, account)
    couple = Notification(
        space_id=space.id,
        recipient_account_id=account.id,
        source_event_id=uuid4(),
        kind="REMINDER_DUE",
    )
    session.add(couple)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0181").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        session.add(_row(account.id))
        session.flush()

        # The downgrade removes operator rows before space_id becomes required again.
        migration.downgrade()
        columns = {
            column["name"]: column for column in inspect(session.connection()).get_columns(
                "notifications"
            )
        }
        assert "operator_topic" not in columns
        assert columns["space_id"]["nullable"] is False
        settings_columns = {
            column["name"]
            for column in inspect(session.connection()).get_columns(
                "instance_administration_settings"
            )
        }
        assert "monitoring_push_enabled" not in settings_columns

        migration.upgrade()
        session.add(_row(account.id))
        session.flush()
    assert session.get(Notification, couple.id) is not None
