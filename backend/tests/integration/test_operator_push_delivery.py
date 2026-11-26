"""Delivering operator notices to ServerAdmin devices (#2314 part 2b)."""

from __future__ import annotations

import json
from datetime import UTC, datetime, time, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import get_settings
from eimir.core import clock
from eimir.engagement import push, push_preview
from eimir.engagement.models import Notification, PushDelivery, PushDeliveryStatus
from eimir.identity.models import AccountEmail
from eimir.jobs.errors import DeferredJobError
from eimir.monitoring import operator_push
from tests.conftest import make_account, requires_database
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=UTC)
ADMIN_EMAIL = "operator@example.test"


@pytest.fixture
def allow_list(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    current = {"emails": [ADMIN_EMAIL]}

    def settings():  # type: ignore[no-untyped-def]
        return get_settings().model_copy(update={"server_admin_emails": current["emails"]})

    monkeypatch.setattr("eimir.authorization.server_admin.get_settings", settings)
    return current


@pytest.fixture
def at(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    current = {"at": NOW}
    monkeypatch.setattr(clock, "now", lambda: current["at"])
    push.providers.clear()
    yield current
    push.providers.clear()


@pytest.fixture
def admin(session: Session, allow_list, at):  # type: ignore[no-untyped-def]
    # A ServerAdmin who belongs to no Space still receives operator notices.
    account = make_account(session, "Operator")
    account.timezone = "UTC"
    session.add(
        AccountEmail(account_id=account.id, email=ADMIN_EMAIL, is_primary=True, verified_at=NOW)
    )
    session.flush()
    return account


@pytest.fixture
def provider(session: Session, admin) -> FakePushProvider:  # type: ignore[no-untyped-def]
    fake = FakePushProvider()
    push.providers.register("operator-test", fake)
    push.register_endpoint(
        session,
        account_id=admin.id,
        provider_key="operator-test",
        endpoint_value=f"secret-{uuid4()}",
    )
    session.flush()
    return fake


def _deliveries(session: Session) -> list[PushDelivery]:
    return list(
        session.scalars(
            select(PushDelivery)
            .join(Notification, Notification.id == PushDelivery.notification_id)
            .order_by(Notification.created_at)
        )
    )


def _deliver(session: Session, delivery: PushDelivery) -> None:
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})


def test_admin_without_a_space_receives_the_notice(session: Session, admin, provider) -> None:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic="failed_jobs", at=NOW, recipients=[admin.id])
    [delivery] = _deliveries(session)

    _deliver(session, delivery)

    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    [call] = provider.calls
    # The wake carries the generic reference only: no topic, no route.
    reference = call["notificationReference"]
    assert isinstance(reference, dict)
    assert reference["kind"] == "OPERATOR_ALERT"
    assert "failed_jobs" not in json.dumps(call)
    assert "server-admin" not in json.dumps(call)


def test_admin_removed_from_the_allow_list_receives_nothing(
    session: Session, admin, provider, allow_list
) -> None:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    [delivery] = _deliveries(session)
    allow_list["emails"] = []

    _deliver(session, delivery)

    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == push.ACCOUNT_UNAVAILABLE_CODE
    assert provider.calls == []


def test_disabled_admin_receives_nothing(session: Session, admin, provider) -> None:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    [delivery] = _deliveries(session)
    admin.disabled_at = NOW
    session.flush()

    _deliver(session, delivery)

    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert provider.calls == []


def test_expired_notice_is_not_sent(session: Session, admin, provider, at) -> None:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    [delivery] = _deliveries(session)
    at["at"] = NOW + timedelta(hours=25)

    _deliver(session, delivery)

    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert provider.calls == []


def test_quiet_hours_hold_the_notice_and_release_only_the_latest(
    session: Session, admin, provider, at
) -> None:  # type: ignore[no-untyped-def]
    admin.quiet_hours_start = time(11)
    admin.quiet_hours_end = time(13)
    session.flush()
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    operator_push.notify(
        session, topic="failed_jobs", at=NOW + timedelta(minutes=5), recipients=[admin.id]
    )
    first, second = _deliveries(session)
    for delivery in (first, second):
        with pytest.raises(DeferredJobError):
            _deliver(session, delivery)
        assert delivery.deferred_until == datetime(2026, 11, 26, 13, tzinfo=UTC)

    at["at"] = datetime(2026, 11, 26, 13, tzinfo=UTC)
    _deliver(session, first)
    _deliver(session, second)

    assert first.status == PushDeliveryStatus.UNAVAILABLE.value
    assert first.last_error_code == "QUIET_HOURS_COALESCED"
    assert second.status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) == 1


def test_operator_and_couple_notices_never_coalesce(session: Session, admin, provider, at) -> None:  # type: ignore[no-untyped-def]
    from tests.conftest import make_space

    space = make_space(session, admin)
    admin.quiet_hours_start = time(11)
    admin.quiet_hours_end = time(13)
    session.flush()
    operator_push.notify(session, topic="disk_pressure", at=NOW, recipients=[admin.id])
    source_event_id = uuid4()
    session.add(
        Notification(
            space_id=space.id,
            recipient_account_id=admin.id,
            source_event_id=source_event_id,
            kind="REMINDER_CREATED",
            created_at=NOW + timedelta(minutes=5),
        )
    )
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    operator, couple = _deliveries(session)
    for delivery in (operator, couple):
        with pytest.raises(DeferredJobError):
            _deliver(session, delivery)

    at["at"] = datetime(2026, 11, 26, 13, tzinfo=UTC)
    _deliver(session, operator)
    _deliver(session, couple)

    assert operator.status == PushDeliveryStatus.SUCCEEDED.value
    assert couple.status == PushDeliveryStatus.SUCCEEDED.value


def test_device_preview_is_the_neutral_notice(session: Session, admin) -> None:  # type: ignore[no-untyped-def]
    operator_push.notify(session, topic="support_reports", at=NOW, recipients=[admin.id])
    notice = session.scalars(select(Notification)).one()

    assert push_preview.for_notification(session, notice, digest=False, version=3) is None
    encoded = push_preview.for_notification(
        session, notice, digest=False, version=3, neutral_reference=True
    )

    assert encoded is not None
    preview = json.loads(encoded)
    assert preview["kind"] == "OPERATOR_ALERT"
    assert preview["name"] == preview["title"] == preview["targetType"] == ""
    assert preview["body"] == preview["when"] == preview["place"] == ""
    assert "support_reports" not in encoded


def test_account_deletion_removes_operator_notices_and_their_deliveries(
    session: Session, admin, provider
) -> None:  # type: ignore[no-untyped-def]
    from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup

    operator_push.notify(session, topic="failed_jobs", at=NOW, recipients=[admin.id])
    assert _deliveries(session)

    apply_accepted_tombstone(session, admin.id, accepted_at=NOW)
    apply_core_cleanup(session, admin.id)
    session.flush()
    session.expire_all()

    assert session.scalars(select(Notification)).all() == []
    assert session.scalars(select(PushDelivery)).all() == []
