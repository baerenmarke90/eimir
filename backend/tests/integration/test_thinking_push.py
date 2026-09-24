"""PostgreSQL/HTTP evidence for M4-B Thinking-of-you and PushDelivery."""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from types import MappingProxyType
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.engagement import notification_policy, notification_preferences, push, service, thinking
from eimir.engagement.models import (
    Activity,
    Notification,
    NotificationKind,
    NotificationPreference,
    PushDelivery,
    PushDeliveryStatus,
    ThinkingOfYouRequest,
)
from eimir.jobs.errors import RetryableJobError
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

    # A previously queued record must be checked again at the provider
    # boundary after a policy upgrade; it cannot bypass the new catalog.
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
    assert stale_delivery.last_error_code == push.POLICY_BLOCKED_CODE
    assert stale_delivery.attempts == 0
    assert provider.calls == []


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
