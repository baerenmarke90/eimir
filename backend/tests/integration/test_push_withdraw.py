"""A read notice leaves the recipient's other devices (#2345).

Reading by any path queues one removal per Android device that received the
notice; the removal carries ids only and reaches only FCM/UnifiedPush.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.engagement import push, push_withdraw
from eimir.engagement import service as engagement
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
    PushEndpoint,
)
from eimir.jobs.errors import RetryableJobError
from eimir.jobs.models import Job
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]


class WithdrawingProvider(FakePushProvider):
    def __init__(self, failure: push.PushProviderError | None = None) -> None:
        super().__init__()
        self.withdrawn: list[dict[str, Any]] = []
        self.withdraw_failure = failure

    def send_withdraw(self, **arguments: Any) -> push.PushSendResult:
        self.withdrawn.append(arguments)
        if self.withdraw_failure is not None:
            raise self.withdraw_failure
        return push.PushSendResult()


@pytest.fixture(autouse=True)
def clear_providers():  # type: ignore[no-untyped-def]
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
        "a": sign_in(session, anna),
        "ctx": AuthorizationContext(account_id=anna.id, space_id=space.id),
    }


def _endpoint(session: Session, account_id: UUID, provider_key: str, provider) -> PushEndpoint:  # type: ignore[no-untyped-def]
    push.providers.register(provider_key, provider)
    endpoint = push.register_endpoint(
        session,
        account_id=account_id,
        provider_key=provider_key,
        endpoint_value=f"secret-{uuid4()}",
    )
    session.flush()
    return endpoint


def _notice(session: Session, couple, **values: Any) -> Notification:  # type: ignore[no-untyped-def]
    fields: dict[str, Any] = {
        "space_id": couple["space"].id,
        "recipient_account_id": couple["anna"].id,
        "source_event_id": uuid4(),
        "kind": NotificationKind.HEART_HUNT_HIDDEN.value,
        "actor_id": couple["ben"].id,
    }
    fields.update(values)
    notice = Notification(**fields)
    session.add(notice)
    session.flush()
    return notice


def _delivered(
    session: Session,
    notice: Notification,
    endpoint: PushEndpoint,
    status: PushDeliveryStatus = PushDeliveryStatus.SUCCEEDED,
) -> None:
    session.add(
        PushDelivery(
            notification_id=notice.id,
            push_endpoint_id=endpoint.id,
            provider_key=endpoint.provider_key,
            status=status.value,
        )
    )
    session.flush()


def _withdraw_jobs(session: Session) -> list[dict[str, Any]]:
    return [
        job.payload
        for job in session.scalars(select(Job).where(Job.kind == push_withdraw.JOB_KIND))
    ]


def test_reading_in_the_inbox_queues_one_removal_per_android_device(  # type: ignore[no-untyped-def]
    client, session, couple
) -> None:
    fcm = _endpoint(session, couple["anna"].id, "fcm", WithdrawingProvider())
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", WithdrawingProvider())
    other = _endpoint(session, couple["anna"].id, "other-test", WithdrawingProvider())
    failed = _endpoint(session, couple["anna"].id, "failed-test", WithdrawingProvider())
    notice = _notice(session, couple)
    _delivered(session, notice, fcm)
    _delivered(session, notice, unified)
    _delivered(session, notice, other)
    _delivered(session, notice, failed, PushDeliveryStatus.FAILED)

    response = client.post(
        f"/api/v1/spaces/{couple['space'].id}/notifications/{notice.id}/read",
        headers=auth(couple["a"]),
    )
    assert response.status_code == 200, response.text

    jobs = _withdraw_jobs(session)
    assert sorted(job["endpointId"] for job in jobs) == sorted([str(fcm.id), str(unified.id)])
    assert all(job["notificationIds"] == [str(notice.id)] for job in jobs)


def test_an_already_read_notice_queues_nothing(client, session, couple) -> None:  # type: ignore[no-untyped-def]
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", WithdrawingProvider())
    notice = _notice(session, couple)
    _delivered(session, notice, unified)
    engagement.mark_notification_read(session, couple["ctx"], notice.id)
    assert len(_withdraw_jobs(session)) == 1

    engagement.mark_notification_read(session, couple["ctx"], notice.id)

    assert len(_withdraw_jobs(session)) == 1


def test_mark_all_and_game_pages_batch_their_removals(session, couple) -> None:  # type: ignore[no-untyped-def]
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", WithdrawingProvider())
    notices = [_notice(session, couple) for _ in range(push.WITHDRAW_BATCH + 1)]
    for notice in notices:
        _delivered(session, notice, unified)

    result = engagement.mark_all_notifications_read(session, couple["ctx"])

    assert result.updated == len(notices)
    jobs = _withdraw_jobs(session)
    assert sorted(len(job["notificationIds"]) for job in jobs) == [1, push.WITHDRAW_BATCH]

    game = _notice(session, couple, kind=NotificationKind.HEART_HUNT_FOUND.value)
    _delivered(session, game, unified)
    assert (
        engagement.mark_notifications_read_for(
            session, couple["ctx"], kinds={NotificationKind.HEART_HUNT_FOUND}
        )
        == 1
    )
    assert [str(game.id)] in [job["notificationIds"] for job in _withdraw_jobs(session)]


def test_a_unifiedpush_removal_sends_ids_only(session, couple) -> None:  # type: ignore[no-untyped-def]
    provider = WithdrawingProvider()
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", provider)
    ids = [uuid4(), uuid4()]

    push_withdraw.handle_withdraw(
        session, {"endpointId": str(unified.id), "notificationIds": [str(item) for item in ids]}
    )

    assert len(provider.withdrawn) == 1
    sent = provider.withdrawn[0]
    assert sent["notification_ids"] == ids
    assert sent["ttl"] == push_withdraw.WITHDRAW_TTL_SECONDS
    assert set(sent) == {"idempotency_key", "endpoint", "notification_ids", "ttl"}
    assert provider.calls == []


def test_an_fcm_device_without_a_preview_key_is_not_addressed(session, couple) -> None:  # type: ignore[no-untyped-def]
    provider = WithdrawingProvider()
    fcm = _endpoint(session, couple["anna"].id, "fcm", provider)

    push_withdraw.handle_withdraw(
        session, {"endpointId": str(fcm.id), "notificationIds": [str(uuid4())]}
    )

    assert provider.withdrawn == []


def test_a_disabled_device_or_a_bad_payload_is_skipped(session, couple) -> None:  # type: ignore[no-untyped-def]
    provider = WithdrawingProvider()
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", provider)
    unified.disabled_at = unified.created_at
    session.flush()

    push_withdraw.handle_withdraw(
        session, {"endpointId": str(unified.id), "notificationIds": [str(uuid4())]}
    )
    push_withdraw.handle_withdraw(session, {"endpointId": "not-an-id", "notificationIds": []})
    push_withdraw.handle_withdraw(
        session,
        {
            "endpointId": str(unified.id),
            "notificationIds": [str(uuid4()) for _ in range(push.WITHDRAW_BATCH + 1)],
        },
    )

    assert provider.withdrawn == []


def test_only_a_retryable_failure_is_retried(session, couple) -> None:  # type: ignore[no-untyped-def]
    flaky = WithdrawingProvider(push.PushProviderError("PUSH_REMOTE_ERROR"))
    unified = _endpoint(session, couple["anna"].id, "unifiedpush", flaky)
    payload = {"endpointId": str(unified.id), "notificationIds": [str(uuid4())]}

    with pytest.raises(RetryableJobError):
        push_withdraw.handle_withdraw(session, payload)

    flaky.withdraw_failure = push.PushProviderError("PUSH_SUBSCRIPTION_GONE", retryable=False)
    push_withdraw.handle_withdraw(session, payload)
