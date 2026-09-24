"""PostgreSQL/HTTP evidence for M4-B Thinking-of-you and PushDelivery."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, time, timedelta
from types import MappingProxyType
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.engagement import notification_policy, notification_preferences, push, service, thinking
from eimir.engagement.models import (
    Activity,
    Notification,
    NotificationChannel,
    NotificationKind,
    NotificationPreference,
    PushDelivery,
    PushDeliveryStatus,
    ThinkingOfYouRequest,
)
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.jobs.errors import DeferredJobError, RetryableJobError
from eimir.outbox.models import OutboxEvent
from eimir.relationship import configuration as space_configuration
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)


class FakePushProvider:
    def __init__(self, *, fail_once: bool = False) -> None:
        self.fail_once = fail_once
        self.calls: list[dict[str, object]] = []

    def send(
        self,
        *,
        idempotency_key: str,
        endpoint: str,
        notification_reference: dict[str, str],
        generic_presentation_key: str,
    ) -> push.PushSendResult:
        self.calls.append(
            {
                "idempotencyKey": idempotency_key,
                "endpoint": endpoint,
                "notificationReference": dict(notification_reference),
                "presentationKey": generic_presentation_key,
            }
        )
        if self.fail_once:
            self.fail_once = False
            raise push.PushProviderError("TEMPORARY_UNAVAILABLE")
        return push.PushSendResult(provider_message_id="provider-message-1")


@pytest.fixture(autouse=True)
def clear_push_providers():  # type: ignore[no-untyped-def]
    push.providers.clear()
    yield
    push.providers.clear()


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
    }


def _url(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/thinking-of-you"


def _set_support_gestures(client, couple, *, enabled: bool) -> None:  # type: ignore[no-untyped-def]
    configuration_url = f"/api/v1/spaces/{couple['space'].id}/configuration"
    current = client.get(configuration_url, headers=auth(couple["anna_token"]))
    assert current.status_code == 200

    response = client.patch(
        configuration_url,
        json={"supportGesturesEnabled": enabled},
        headers={
            **auth(couple["anna_token"]),
            "If-Match": current.headers["etag"],
        },
    )
    assert response.status_code == 200
    assert response.json()["supportGesturesEnabled"] is enabled


def test_disabled_support_gestures_block_new_send_and_reenable_cleanly(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)

    _set_support_gestures(client, couple, enabled=False)
    blocked = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert blocked.status_code == 403
    assert blocked.json()["code"] == space_configuration.SpaceConfigurationErrorCode.MODULE_DISABLED
    assert session.execute(select(func.count(ThinkingOfYouRequest.id))).scalar_one() == 0
    assert session.execute(select(func.count(OutboxEvent.id))).scalar_one() == 0

    _set_support_gestures(client, couple, enabled=True)
    allowed = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert allowed.status_code == 202
    assert session.execute(select(func.count(ThinkingOfYouRequest.id))).scalar_one() == 1


def test_disable_preserves_existing_notification_and_suppresses_queued_effect(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)

    first = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert first.status_code == 202
    requests = (
        session.execute(
            select(ThinkingOfYouRequest).order_by(
                ThinkingOfYouRequest.created_at, ThinkingOfYouRequest.id
            )
        )
        .scalars()
        .all()
    )
    first_event = session.get(OutboxEvent, requests[0].source_event_id)
    assert first_event is not None
    service.project_event(session, first_event)
    session.flush()
    first_notification = session.execute(
        select(Notification).where(Notification.source_event_id == first_event.id)
    ).scalar_one()

    queued = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["ben_token"]),
    )
    assert queued.status_code == 202
    requests = (
        session.execute(
            select(ThinkingOfYouRequest).order_by(
                ThinkingOfYouRequest.created_at, ThinkingOfYouRequest.id
            )
        )
        .scalars()
        .all()
    )
    assert len(requests) == 2
    queued_request = next(
        request for request in requests if request.source_event_id != first_event.id
    )
    queued_event = session.get(OutboxEvent, queued_request.source_event_id)
    assert queued_event is not None

    _set_support_gestures(client, couple, enabled=False)
    service.project_event(session, queued_event)
    session.flush()

    notifications = session.execute(select(Notification)).scalars().all()
    assert [notification.id for notification in notifications] == [first_notification.id]
    assert session.get(ThinkingOfYouRequest, requests[0].id) is not None
    assert session.get(ThinkingOfYouRequest, queued_request.id) is not None


def test_replay_is_idempotent_before_cooldown_and_projects_notification_only(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    request_id = uuid4()

    first = client.post(
        _url(couple),
        json={"clientRequestId": str(request_id)},
        headers=auth(couple["anna_token"]),
    )
    replay = client.post(
        _url(couple),
        json={"clientRequestId": str(request_id)},
        headers=auth(couple["anna_token"]),
    )
    assert first.status_code == replay.status_code == 202
    expected_available_at = (
        (NOW + timedelta(seconds=thinking.COOLDOWN_SECONDS)).isoformat().replace("+00:00", "Z")
    )
    assert (
        first.json()
        == replay.json()
        == {
            "clientRequestId": str(request_id),
            "thinkingOfYouAvailableAt": expected_available_at,
        }
    )

    requests = session.execute(select(ThinkingOfYouRequest)).scalars().all()
    assert len(requests) == 1
    event_id = requests[0].source_event_id
    event = session.get(OutboxEvent, event_id)
    assert event is not None
    assert event.event_type == "PARTNER_THINKING_OF_YOU"
    assert event.payload.recipient_id == couple["ben"].id

    service.project_event(session, event)
    service.project_event(session, event)
    session.flush()

    notifications = (
        session.execute(select(Notification).where(Notification.source_event_id == event_id))
        .scalars()
        .all()
    )
    assert len(notifications) == 1
    assert notifications[0].recipient_account_id == couple["ben"].id
    assert notifications[0].kind == NotificationKind.THINKING_OF_YOU.value
    assert notifications[0].target_type is None
    assert notifications[0].target_id is None

    activity_count = session.execute(
        select(func.count(Activity.id)).where(Activity.source_event_id == event_id)
    ).scalar_one()
    assert activity_count == 0

    blocked = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert blocked.status_code == 429
    assert blocked.json()["code"] == thinking.THINKING_OF_YOU_COOLDOWN


def test_cooldown_is_thirty_minutes_with_retry_after_header_and_expires(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Product Owner decision (#790/#791): a 30-minute, server-authoritative
    cooldown, not merely the earlier 60-second technical anti-spam bound. The
    blocked response also carries a structured Retry-After header so a client
    never has to parse error text to show remaining time.
    """
    current = {"value": NOW}
    monkeypatch.setattr(thinking.clock, "now", lambda: current["value"])
    assert thinking.COOLDOWN_SECONDS == 30 * 60

    first = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert first.status_code == 202

    # Still well within the 30-minute cooldown: blocked, with the exact
    # remaining seconds in the Retry-After header.
    current["value"] = NOW + timedelta(minutes=29)
    blocked = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert blocked.status_code == 429
    assert blocked.json()["code"] == thinking.THINKING_OF_YOU_COOLDOWN
    retry_after = int(blocked.headers["retry-after"])
    assert 0 < retry_after <= 60

    # A replay of the very first clientRequestId stays idempotent and does
    # not extend or reset the cooldown.
    replay = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert replay.status_code == 429

    # Once the full 30 minutes have elapsed, sending is available again.
    current["value"] = NOW + timedelta(minutes=30, seconds=1)
    allowed = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert allowed.status_code == 202

    sent_count = session.execute(
        select(func.count(ThinkingOfYouRequest.id)).where(
            ThinkingOfYouRequest.sender_account_id == couple["anna"].id
        )
    ).scalar_one()
    assert sent_count == 2


def test_cooldown_is_isolated_per_sender_and_space(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)

    anna_send = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert anna_send.status_code == 202

    # The partner's own send in the same Space is a distinct sender and is
    # never blocked by Anna's cooldown.
    ben_send = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["ben_token"]),
    )
    assert ben_send.status_code == 202

    # A completely different couple/Space is unaffected too.
    other_anna = make_account(session, "Other Anna")
    other_ben = make_account(session, "Other Ben")
    other_space = make_space(session, other_anna)
    relationship_service.add_member(session, other_space.id, other_ben)
    session.flush()
    other_token = sign_in(session, other_anna)

    other_send = client.post(
        f"/api/v1/spaces/{other_space.id}/thinking-of-you",
        json={"clientRequestId": str(uuid4())},
        headers=auth(other_token),
    )
    assert other_send.status_code == 202


def test_no_other_active_partner_creates_no_signal(client, session: Session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    anna = make_account(session, "Solo")
    space = make_space(session, anna)
    session.flush()
    token = sign_in(session, anna)

    response = client.post(
        f"/api/v1/spaces/{space.id}/thinking-of-you",
        json={"clientRequestId": str(uuid4())},
        headers=auth(token),
    )
    assert response.status_code == 404
    assert response.json()["code"] == thinking.PARTNER_NOT_AVAILABLE
    assert session.execute(select(func.count(ThinkingOfYouRequest.id))).scalar_one() == 0


def test_push_uses_generic_payload_and_logical_delivery_is_unique(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    endpoint = push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="secret-endpoint-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    response = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202
    request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None

    service.project_event(session, event)
    service.project_event(session, event)
    session.flush()

    deliveries = session.execute(select(PushDelivery)).scalars().all()
    assert len(deliveries) == 1
    delivery = deliveries[0]
    assert delivery.push_endpoint_id == endpoint.id
    assert not hasattr(delivery, "payload")
    assert not hasattr(delivery, "body")

    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()

    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert delivery.attempts == 1
    assert delivery.provider_message_id == "provider-message-1"
    assert len(provider.calls) == 1
    call = provider.calls[0]
    assert call["endpoint"] == "secret-endpoint-token"
    assert call["presentationKey"] == push.GENERIC_PRESENTATION_KEY
    reference = call["notificationReference"]
    assert isinstance(reference, dict)
    assert set(reference) == {"id", "kind"}
    assert reference["kind"] == NotificationKind.THINKING_OF_YOU.value
    assert "Anna" not in repr(call)
    assert "Ben" not in repr(call)


def test_quiet_hours_rechecks_and_coalesces_deferred_partner_pushes(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    ben = couple["ben"]
    ben.timezone = "Europe/Berlin"
    ben.quiet_hours_start = time(22)
    ben.quiet_hours_end = time(7)
    push.register_endpoint(
        session, account_id=ben.id, provider_key="fake", endpoint_value="quiet-hours-token"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    quiet_at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    release = datetime(2026, 8, 31, 5, 0, tzinfo=UTC)
    current = {"at": quiet_at}
    monkeypatch.setattr(push.clock, "now", lambda: current["at"])
    deliveries = []
    for offset in (0, 1):
        source_event_id = uuid4()
        notification = Notification(
            space_id=couple["space"].id,
            recipient_account_id=ben.id,
            source_event_id=source_event_id,
            kind=NotificationKind.THINKING_OF_YOU.value,
            actor_id=couple["anna"].id,
            created_at=quiet_at + timedelta(minutes=offset),
        )
        session.add(notification)
        session.flush()
        push.ensure_deliveries_for_source_event(session, source_event_id)
        delivery = session.execute(
            select(PushDelivery).where(PushDelivery.notification_id == notification.id)
        ).scalar_one()
        with pytest.raises(DeferredJobError) as deferred:
            push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert deferred.value.until == quiet_at + push.QUIET_HOURS_RECHECK
        assert delivery.deferred_until == release
        assert delivery.attempts == 0
        deliveries.append(delivery)

    assert provider.calls == []
    current["at"] = release
    push.handle_delivery(session, {"deliveryId": str(deliveries[0].id)})
    push.handle_delivery(session, {"deliveryId": str(deliveries[1].id)})
    push.handle_delivery(session, {"deliveryId": str(deliveries[1].id)})

    assert deliveries[0].status == PushDeliveryStatus.UNAVAILABLE.value
    assert deliveries[0].last_error_code == "QUIET_HOURS_COALESCED"
    assert deliveries[1].status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) == 1
    assert provider.calls[0]["presentationKey"] == push.GENERIC_PRESENTATION_KEY
    assert session.execute(select(func.count(Notification.id))).scalar_one() == 2


def test_quiet_hours_timezone_change_releases_waiting_push_at_next_recheck(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    ben = couple["ben"]
    ben.timezone = "Europe/Berlin"
    ben.quiet_hours_start = time(22)
    ben.quiet_hours_end = time(7)
    push.register_endpoint(
        session, account_id=ben.id, provider_key="fake", endpoint_value="timezone-token"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    at = datetime(2026, 8, 30, 20, 15, tzinfo=UTC)
    current = {"at": at}
    monkeypatch.setattr(push.clock, "now", lambda: current["at"])
    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=ben.id,
        source_event_id=source_event_id,
        kind=NotificationKind.PARTNER_KISS.value,
        actor_id=couple["anna"].id,
        created_at=at,
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()
    with pytest.raises(DeferredJobError):
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.deferred_until == datetime(2026, 8, 31, 5, tzinfo=UTC)

    ben.timezone = "America/New_York"
    current["at"] = at + push.QUIET_HOURS_RECHECK
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.deferred_until == current["at"]
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) == 1


def test_quiet_hours_rechecks_channel_choice_before_release(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    ben = couple["ben"]
    ben.timezone = "Europe/Berlin"
    ben.quiet_hours_start = time(22)
    ben.quiet_hours_end = time(7)
    push.register_endpoint(
        session, account_id=ben.id, provider_key="fake", endpoint_value="changed-choice-token"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    current = {"at": datetime(2026, 8, 30, 20, 15, tzinfo=UTC)}
    monkeypatch.setattr(push.clock, "now", lambda: current["at"])

    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=ben.id,
        source_event_id=source_event_id,
        kind=NotificationKind.PARTNER_CHECK_IN.value,
        actor_id=couple["anna"].id,
        created_at=current["at"],
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()
    with pytest.raises(DeferredJobError):
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})

    notification_preferences.set_push_enabled(
        session, account_id=ben.id, kind=NotificationKind.PARTNER_CHECK_IN, enabled=False
    )
    current["at"] = datetime(2026, 8, 31, 5, tzinfo=UTC)
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == "PUSH_PREFERENCE_DISABLED"
    assert delivery.attempts == 0
    assert provider.calls == []
    assert session.get(Notification, notification.id) is not None


def test_quiet_hours_preserves_due_reminder_schedule(session: Session, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    ben = couple["ben"]
    ben.timezone = "Europe/Berlin"
    ben.quiet_hours_start = time(22)
    ben.quiet_hours_end = time(7)
    push.register_endpoint(
        session, account_id=ben.id, provider_key="fake", endpoint_value="reminder-token"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    monkeypatch.setattr(push.clock, "now", lambda: datetime(2026, 8, 30, 20, 15, tzinfo=UTC))
    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=ben.id,
        source_event_id=source_event_id,
        kind=NotificationKind.REMINDER_DUE.value,
        actor_id=None,
        created_at=datetime(2026, 8, 30, 20, 15, tzinfo=UTC),
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert delivery.deferred_until is None
    assert len(provider.calls) == 1


def test_digestible_notification_does_not_enqueue_or_send_an_individual_push(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    endpoint = push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="comment-endpoint-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=source_event_id,
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type=None,
        target_id=None,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()

    push.ensure_deliveries_for_source_event(session, source_event_id)
    assert session.execute(select(PushDelivery)).scalars().all() == []

    # A stale manually queued record cannot bypass the explicit opt-in gate.
    stale_delivery = PushDelivery(
        notification_id=notification.id,
        push_endpoint_id=endpoint.id,
        provider_key="fake",
        status=PushDeliveryStatus.PENDING.value,
        attempts=0,
    )
    session.add(stale_delivery)
    session.flush()
    push.handle_delivery(session, {"deliveryId": str(stale_delivery.id)})

    assert stale_delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert stale_delivery.last_error_code == "PUSH_PREFERENCE_DISABLED"
    assert stale_delivery.attempts == 0
    assert provider.calls == []


def test_opted_in_comment_batch_sends_one_generic_push_after_window(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    instant = [NOW + timedelta(minutes=10)]
    monkeypatch.setattr(push.clock, "now", lambda: instant[0])
    push.register_endpoint(
        session, account_id=couple["ben"].id, provider_key="fake", endpoint_value="digest-token"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    session.add(
        NotificationPreference(
            account_id=couple["ben"].id,
            kind=NotificationKind.COMMENT_CREATED.value,
            channel=NotificationChannel.PUSH.value,
            enabled=True,
        )
    )
    session.flush()

    notifications = []
    for minute in (10, 20):
        instant[0] = NOW + timedelta(minutes=minute)
        notification = Notification(
            space_id=couple["space"].id,
            recipient_account_id=couple["ben"].id,
            source_event_id=uuid4(),
            kind=NotificationKind.COMMENT_CREATED.value,
            actor_id=couple["anna"].id,
            target_type=None,
            target_id=None,
            created_at=instant[0],
        )
        session.add(notification)
        session.flush()
        push.ensure_deliveries_for_source_event(session, notification.source_event_id)
        notifications.append(notification)
    session.flush()
    deliveries = (
        session.execute(select(PushDelivery).order_by(PushDelivery.created_at)).scalars().all()
    )
    assert len(deliveries) == 2

    with pytest.raises(DeferredJobError):
        push.handle_delivery(session, {"deliveryId": str(deliveries[0].id)})
    assert provider.calls == []
    instant[0] = NOW + timedelta(hours=1, minutes=1)
    push.handle_delivery(session, {"deliveryId": str(deliveries[0].id)})
    push.handle_delivery(session, {"deliveryId": str(deliveries[1].id)})
    push.handle_delivery(session, {"deliveryId": str(deliveries[1].id)})
    assert deliveries[0].status == PushDeliveryStatus.UNAVAILABLE.value
    assert deliveries[0].last_error_code == "DIGEST_COALESCED"
    assert deliveries[1].status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) == 1
    assert provider.calls[0]["notificationReference"] == {
        "id": str(notifications[1].id),
        "kind": NotificationKind.COMMENT_CREATED.value,
    }
    assert str(provider.calls[0]["idempotencyKey"]).startswith("digest:")
    assert all(notification.read_at is None for notification in notifications)


def test_comment_digest_rechecks_opt_in_and_target_privacy(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    instant = [NOW + timedelta(minutes=10)]
    monkeypatch.setattr(push.clock, "now", lambda: instant[0])
    push.register_endpoint(
        session, account_id=couple["ben"].id, provider_key="fake", endpoint_value="private-digest"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    preference = NotificationPreference(
        account_id=couple["ben"].id,
        kind=NotificationKind.COMMENT_CREATED.value,
        channel=NotificationChannel.PUSH.value,
        enabled=True,
    )
    session.add(preference)
    moment = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="Private later", emotion=HeartEmotion.SEEN),
    )
    session.add(moment)
    session.flush()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type="HEART_MOMENT",
        target_id=moment.id,
        created_at=instant[0],
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, notification.source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()

    instant[0] = NOW + timedelta(hours=1, minutes=1)
    moment.privacy_class = PrivacyClass.OWNER_ONLY.value
    session.flush()
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == "PUSH_TARGET_UNAVAILABLE"
    assert provider.calls == []

    # A fresh projection after revocation cannot create a latent delivery.
    instant[0] += timedelta(minutes=1)
    later = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type="HEART_MOMENT",
        target_id=moment.id,
        created_at=instant[0],
    )
    session.add(later)
    session.flush()
    push.ensure_deliveries_for_source_event(session, later.source_event_id)
    assert session.execute(select(func.count(PushDelivery.id))).scalar_one() == 1

    moment.privacy_class = PrivacyClass.SPACE_SHARED.value
    session.flush()
    instant[0] += timedelta(minutes=1)
    opted_out = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type="HEART_MOMENT",
        target_id=moment.id,
        created_at=instant[0],
    )
    session.add(opted_out)
    session.flush()
    push.ensure_deliveries_for_source_event(session, opted_out.source_event_id)
    queued = session.execute(
        select(PushDelivery).where(PushDelivery.notification_id == opted_out.id)
    ).scalar_one()
    preference.enabled = False
    session.flush()
    instant[0] = NOW + timedelta(hours=2, minutes=1)
    push.handle_delivery(session, {"deliveryId": str(queued.id)})
    assert queued.status == PushDeliveryStatus.UNAVAILABLE.value
    assert queued.last_error_code == "PUSH_PREFERENCE_DISABLED"
    assert provider.calls == []


def test_comment_digest_obeys_current_quiet_hours_and_timezone(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    instant = [NOW.replace(hour=21, minute=10)]
    monkeypatch.setattr(push.clock, "now", lambda: instant[0])
    ben = couple["ben"]
    ben.timezone = "UTC"
    ben.quiet_hours_start = time(22, 0)
    ben.quiet_hours_end = time(7, 0)
    session.add(
        NotificationPreference(
            account_id=ben.id,
            kind=NotificationKind.COMMENT_CREATED.value,
            channel=NotificationChannel.PUSH.value,
            enabled=True,
        )
    )
    push.register_endpoint(
        session, account_id=ben.id, provider_key="fake", endpoint_value="quiet-digest"
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=ben.id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type=None,
        target_id=None,
        created_at=instant[0],
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, notification.source_event_id)
    session.flush()
    delivery = session.execute(select(PushDelivery)).scalar_one()

    instant[0] = NOW.replace(hour=22, minute=1)
    with pytest.raises(DeferredJobError):
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.deferred_until is not None
    assert provider.calls == []

    # The Account's current timezone, rather than an old stored UTC instant,
    # decides the next release when the worker revisits the same job.
    ben.timezone = "America/New_York"
    session.flush()
    instant[0] = NOW.replace(hour=22, minute=16)
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) == 1


def test_unreviewed_preview_change_blocks_an_already_queued_push(
    session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="private-endpoint-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=source_event_id,
        kind=NotificationKind.THINKING_OF_YOU.value,
        actor_id=couple["anna"].id,
        target_type=None,
        target_id=None,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()

    expanded_catalog = dict(notification_policy.POLICIES)
    expanded_catalog[NotificationKind.THINKING_OF_YOU] = replace(
        expanded_catalog[NotificationKind.THINKING_OF_YOU],
        preview=replace(notification_policy.GENERIC_PREVIEW, allow_sender_name=True),
    )
    monkeypatch.setattr(notification_policy, "POLICIES", MappingProxyType(expanded_catalog))
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})

    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == push.POLICY_BLOCKED_CODE
    assert delivery.attempts == 0
    assert provider.calls == []


@pytest.mark.parametrize("revoke_target", [False, True])
def test_push_rechecks_target_privacy_before_contacting_provider(
    session: Session, couple, revoke_target: bool
) -> None:  # type: ignore[no-untyped-def]
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="target-privacy-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    moment = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="Shared first", emotion=HeartEmotion.SEEN),
    )
    session.add(moment)
    session.flush()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.THINKING_OF_YOU.value,
        actor_id=couple["anna"].id,
        target_type="HEART_MOMENT",
        target_id=moment.id,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, notification.source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()

    if revoke_target:
        moment.privacy_class = PrivacyClass.OWNER_ONLY.value
        session.flush()
        later = Notification(
            space_id=couple["space"].id,
            recipient_account_id=couple["ben"].id,
            source_event_id=uuid4(),
            kind=NotificationKind.THINKING_OF_YOU.value,
            actor_id=couple["anna"].id,
            target_type="HEART_MOMENT",
            target_id=moment.id,
            created_at=NOW,
        )
        session.add(later)
        session.flush()
        push.ensure_deliveries_for_source_event(session, later.source_event_id)
        assert session.execute(select(func.count(PushDelivery.id))).scalar_one() == 1

    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    if revoke_target:
        assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
        assert delivery.last_error_code == "PUSH_TARGET_UNAVAILABLE"
        assert delivery.attempts == 0
        assert provider.calls == []
    else:
        assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
        assert len(provider.calls) == 1


def test_personal_push_choice_suppresses_enqueue_without_muting_the_partner(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="personal-choice-token",
    )
    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=source_event_id,
        kind=NotificationKind.THINKING_OF_YOU.value,
        actor_id=couple["anna"].id,
        target_type=None,
        target_id=None,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()

    assert notification_preferences.push_enabled(
        session, account_id=couple["ben"].id, kind=notification.kind
    )
    assert not notification_preferences.push_enabled(
        session, account_id=couple["ben"].id, kind=NotificationKind.COMMENT_CREATED.value
    )
    with pytest.raises(ValueError, match="Push is not available"):
        notification_preferences.set_push_enabled(
            session,
            account_id=couple["ben"].id,
            kind=NotificationKind.COMMENT_CREATED,
            enabled=True,
        )
    notification_preferences.set_push_enabled(
        session,
        account_id=couple["ben"].id,
        kind=NotificationKind.THINKING_OF_YOU,
        enabled=False,
    )
    push.ensure_deliveries_for_source_event(session, source_event_id)
    suppressed = session.execute(select(PushDelivery)).scalar_one()
    assert suppressed.status == PushDeliveryStatus.UNAVAILABLE.value
    assert suppressed.last_error_code == "PUSH_PREFERENCE_DISABLED"
    assert notification_preferences.push_enabled(
        session, account_id=couple["anna"].id, kind=notification.kind
    )
    assert notification_preferences.push_enabled(
        session, account_id=couple["ben"].id, kind=NotificationKind.REMINDER_DUE.value
    )

    notification_preferences.set_push_enabled(
        session,
        account_id=couple["ben"].id,
        kind=NotificationKind.THINKING_OF_YOU,
        enabled=True,
    )
    push.ensure_deliveries_for_source_event(session, source_event_id)
    assert session.execute(select(func.count(PushDelivery.id))).scalar_one() == 1
    assert suppressed.status == PushDeliveryStatus.UNAVAILABLE.value
    assert session.execute(select(func.count(NotificationPreference.id))).scalar_one() == 1


def test_in_app_off_keeps_push_and_preserves_existing_center_state(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="independent-channel-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    space_id = couple["space"].id
    center = f"/api/v1/spaces/{space_id}/notifications"

    first = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert first.status_code == 202
    first_request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    first_event = session.get(OutboxEvent, first_request.source_event_id)
    assert first_event is not None
    service.project_event(session, first_event)
    session.flush()
    original = session.execute(
        select(Notification).where(Notification.source_event_id == first_event.id)
    ).scalar_one()
    assert original.in_app_visible is True
    read = client.post(f"{center}/{original.id}/read", headers=auth(couple["ben_token"]))
    assert read.status_code == 200
    original_read_at = original.read_at

    disabled = client.patch(
        "/api/v1/notification-preferences/THINKING_OF_YOU/IN_APP",
        json={"enabled": False},
        headers=auth(couple["ben_token"]),
    )
    assert disabled.status_code == 200
    second = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["ben_token"]),
    )
    assert second.status_code == 202
    second_request = session.execute(
        select(ThinkingOfYouRequest).where(ThinkingOfYouRequest.id != first_request.id)
    ).scalar_one()
    second_event = session.get(OutboxEvent, second_request.source_event_id)
    assert second_event is not None
    # The other Account still uses its own visible default.
    service.project_event(session, second_event)

    # New event for Ben from Anna, after the sender's 30-minute cooldown.
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW + timedelta(minutes=31))
    third = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert third.status_code == 202
    third_request = session.execute(
        select(ThinkingOfYouRequest)
        .where(ThinkingOfYouRequest.id != first_request.id)
        .where(ThinkingOfYouRequest.id != second_request.id)
    ).scalar_one()
    third_event = session.get(OutboxEvent, third_request.source_event_id)
    assert third_event is not None
    service.project_event(session, third_event)
    service.project_event(session, third_event)
    session.flush()
    hidden = session.execute(
        select(Notification).where(Notification.source_event_id == third_event.id)
    ).scalar_one()
    assert hidden.in_app_visible is False
    queued = session.execute(
        select(PushDelivery).where(PushDelivery.notification_id == hidden.id)
    ).scalar_one()
    assert queued.status == PushDeliveryStatus.PENDING.value
    push.handle_delivery(session, {"deliveryId": str(queued.id)})
    assert queued.status == PushDeliveryStatus.SUCCEEDED.value
    assert len(provider.calls) >= 1

    visible = client.get(center, headers=auth(couple["ben_token"]))
    assert visible.status_code == 200
    assert [item["id"] for item in visible.json()["items"]] == [str(original.id)]
    count = client.get(f"{center}/unread-count", headers=auth(couple["ben_token"]))
    assert count.json()["unreadCount"] == 0
    hidden_read = client.post(f"{center}/{hidden.id}/read", headers=auth(couple["ben_token"]))
    assert hidden_read.status_code == 404
    assert hidden_read.json()["code"] == "NOTIFICATION_NOT_FOUND"
    mark_all = client.post(f"{center}/read-all", headers=auth(couple["ben_token"]))
    assert mark_all.status_code == 200
    assert mark_all.json()["updated"] == 0
    assert hidden.read_at is None
    assert original.read_at == original_read_at

    enabled = client.patch(
        "/api/v1/notification-preferences/THINKING_OF_YOU/IN_APP",
        json={"enabled": True},
        headers=auth(couple["ben_token"]),
    )
    assert enabled.status_code == 200
    after = client.get(center, headers=auth(couple["ben_token"]))
    assert [item["id"] for item in after.json()["items"]] == [str(original.id)]


def test_disabling_push_after_queueing_blocks_delivery_and_reenable_does_not_replay(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="queued-choice-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)
    source_event_id = uuid4()
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["ben"].id,
        source_event_id=source_event_id,
        kind=NotificationKind.THINKING_OF_YOU.value,
        actor_id=couple["anna"].id,
        target_type=None,
        target_id=None,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()
    push.ensure_deliveries_for_source_event(session, source_event_id)
    delivery = session.execute(select(PushDelivery)).scalar_one()

    notification_preferences.set_push_enabled(
        session,
        account_id=couple["ben"].id,
        kind=NotificationKind.THINKING_OF_YOU,
        enabled=False,
    )
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == "PUSH_PREFERENCE_DISABLED"
    assert delivery.attempts == 0
    assert provider.calls == []

    notification_preferences.set_push_enabled(
        session,
        account_id=couple["ben"].id,
        kind=NotificationKind.THINKING_OF_YOU,
        enabled=True,
    )
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert provider.calls == []


def test_disable_after_projection_prevents_pending_push_and_reenable_does_not_replay(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="secret-endpoint-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    response = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202
    request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None

    # The notification and PushDelivery already exist before the manager turns
    # the module off. Disable remains non-destructive, but the queued provider
    # side effect must still observe the current authoritative capability.
    service.project_event(session, event)
    session.flush()
    notification = session.execute(select(Notification)).scalar_one()
    delivery = session.execute(select(PushDelivery)).scalar_one()

    _set_support_gestures(client, couple, enabled=False)
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()

    assert session.get(Notification, notification.id) is not None
    assert session.get(ThinkingOfYouRequest, request.id) is not None
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert (
        delivery.last_error_code == space_configuration.SpaceConfigurationErrorCode.MODULE_DISABLED
    )
    assert provider.calls == []

    # A terminally suppressed old delivery stays suppressed. Re-enabling only
    # restores future participation; it must not resurrect stale queued work.
    _set_support_gestures(client, couple, enabled=True)
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert provider.calls == []


def test_push_retry_keeps_stable_idempotency_key_and_sanitized_error(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="secret-endpoint-token",
    )
    provider = FakePushProvider(fail_once=True)
    push.providers.register("fake", provider)

    response = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202
    request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None
    service.project_event(session, event)
    session.flush()
    delivery = session.execute(select(PushDelivery)).scalar_one()

    with pytest.raises(RetryableJobError) as retry:
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert retry.value.code == "TEMPORARY_UNAVAILABLE"
    assert delivery.status == PushDeliveryStatus.RETRYING.value
    assert delivery.attempts == 1
    assert delivery.last_error_code == "TEMPORARY_UNAVAILABLE"

    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert delivery.attempts == 2
    assert len(provider.calls) == 2
    assert provider.calls[0]["idempotencyKey"] == provider.calls[1]["idempotencyKey"]


def test_unconfigured_provider_is_nonfatal_and_marks_delivery_unavailable(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="not-configured",
        endpoint_value="secret-endpoint-token",
    )

    response = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202
    request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None
    service.project_event(session, event)
    session.flush()
    delivery = session.execute(select(PushDelivery)).scalar_one()

    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert delivery.last_error_code == "PUSH_NOT_CONFIGURED"


def test_membership_change_prevents_pending_push_delivery(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    push.register_endpoint(
        session,
        account_id=couple["ben"].id,
        provider_key="fake",
        endpoint_value="secret-endpoint-token",
    )
    provider = FakePushProvider()
    push.providers.register("fake", provider)

    response = client.post(
        _url(couple),
        json={"clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202
    request = session.execute(select(ThinkingOfYouRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None
    service.project_event(session, event)
    session.flush()
    delivery = session.execute(select(PushDelivery)).scalar_one()

    membership = session.execute(
        select(Membership).where(
            Membership.space_id == couple["space"].id,
            Membership.account_id == couple["ben"].id,
        )
    ).scalar_one()
    membership.status = MembershipStatus.REMOVED.value
    session.flush()

    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    session.flush()
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert provider.calls == []
