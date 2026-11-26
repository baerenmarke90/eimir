"""Operator notices for ServerAdmins: creation and recipients (#2314 part 2b)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.core import clock
from eimir.engagement import push
from eimir.engagement.models import Notification, PushDelivery, PushDeliveryStatus
from eimir.identity.models import AccountEmail
from eimir.monitoring import operator_push
from tests.conftest import make_account, requires_database
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)
ADMIN_EMAIL = "operator@example.test"
PENDING_EMAIL = "pending@example.test"
DISABLED_EMAIL = "disabled@example.test"


@pytest.fixture(autouse=True)
def allow_listed(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(
        update={"server_admin_emails": [ADMIN_EMAIL, PENDING_EMAIL, DISABLED_EMAIL]}
    )
    monkeypatch.setattr("eimir.authorization.server_admin.get_settings", lambda: settings)
    monkeypatch.setattr(clock, "now", lambda: NOW)
    push.providers.clear()
    yield
    push.providers.clear()


def _admin(session: Session, email: str = ADMIN_EMAIL, *, verified: bool = True):  # type: ignore[no-untyped-def]
    account = make_account(session, "Operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=email,
            is_primary=True,
            verified_at=NOW if verified else None,
        )
    )
    session.flush()
    return account


def _endpoint(session: Session, account_id: UUID) -> FakePushProvider:
    provider = FakePushProvider()
    push.providers.register("operator-test", provider)
    push.register_endpoint(
        session,
        account_id=account_id,
        provider_key="operator-test",
        endpoint_value=f"secret-{uuid4()}",
    )
    session.flush()
    return provider


def test_notify_creates_one_spaceless_hidden_notice_per_recipient(session: Session) -> None:
    first = _admin(session)
    second = _admin(session, PENDING_EMAIL)

    created = operator_push.notify(
        session, topic="failed_jobs", at=NOW, recipients=[first.id, second.id]
    )

    assert created == 2
    rows = session.scalars(select(Notification).order_by(Notification.recipient_account_id)).all()
    assert {row.recipient_account_id for row in rows} == {first.id, second.id}
    for row in rows:
        assert row.kind == "OPERATOR_ALERT"
        assert row.space_id is None
        assert row.operator_topic == "failed_jobs"
        assert row.in_app_visible is False
        assert row.target_type is None and row.actor_id is None
        assert clock.ensure_utc(row.expires_at) == NOW + timedelta(hours=24)
    assert len({row.source_event_id for row in rows}) == 1


def test_notify_queues_push_for_the_recipients_devices(session: Session) -> None:
    admin = _admin(session)
    _endpoint(session, admin.id)

    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])

    [delivery] = session.scalars(select(PushDelivery)).all()
    assert delivery.status == PushDeliveryStatus.PENDING.value


def test_notify_without_recipients_creates_nothing(session: Session) -> None:
    assert operator_push.notify(session, topic="failed_jobs", at=NOW, recipients=[]) == 0
    assert session.scalars(select(Notification)).all() == []


def test_is_operator_requires_an_enabled_account_with_a_verified_allow_listed_address(
    session: Session,
) -> None:
    admin = _admin(session)
    pending = _admin(session, PENDING_EMAIL, verified=False)
    other = _admin(session, "someone@example.test")
    disabled = _admin(session, DISABLED_EMAIL)
    disabled.disabled_at = NOW
    session.flush()

    assert operator_push.is_operator(session, admin.id) is True
    assert operator_push.is_operator(session, pending.id) is False
    assert operator_push.is_operator(session, other.id) is False
    assert operator_push.is_operator(session, disabled.id) is False
    assert operator_push.is_operator(session, uuid4()) is False


def test_route_opens_the_matching_server_admin_page() -> None:
    assert operator_push.route("failed_jobs") == "/server-admin?section=jobs"
    assert operator_push.route("support_reports") == "/server-admin?section=reports&state=NEW"
    assert operator_push.route("space_quota_pressure") == "/server-admin?section=overview"
    for topic in ("disk_pressure", "delivery_failures", "backup_not_configured"):
        assert operator_push.route(topic) == "/server-admin?section=monitoring"


def test_prune_removes_expired_operator_notices_only(session: Session) -> None:
    from tests.conftest import make_space

    admin = _admin(session)
    operator_push.notify(
        session, topic="failed_jobs", at=NOW - timedelta(days=3), recipients=[admin.id]
    )
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    space = make_space(session, admin)
    session.add(
        Notification(
            space_id=space.id,
            recipient_account_id=admin.id,
            source_event_id=uuid4(),
            kind="REMINDER_DUE",
            expires_at=NOW - timedelta(days=3),
        )
    )
    session.flush()

    assert operator_push.prune(session, at=NOW) == 1

    remaining = session.scalars(select(Notification)).all()
    assert sorted(row.operator_topic or row.kind for row in remaining) == [
        "REMINDER_DUE",
        "disk_pressure",
    ]
