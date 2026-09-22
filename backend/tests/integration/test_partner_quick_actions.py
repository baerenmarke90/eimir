from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.engagement import service, thinking
from eimir.engagement.models import (
    Activity,
    Notification,
    NotificationKind,
    SupportGestureRequest,
)
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.outbox.models import OutboxEvent
from eimir.relationship import configuration as space_configuration
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 9, 22, 18, 0, tzinfo=UTC)


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
        "outsider_token": sign_in(session, outsider),
    }


def _url(couple, *, space_id=None) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{space_id or couple['space'].id}/partner-quick-actions"


def _grant_extended_actions(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    # `effective_from` is anchored to the test's own frozen NOW rather than
    # the real wall clock: several tests monkeypatch `thinking.clock.now` to
    # NOW *after* granting, and that patch freezes the single shared
    # `eimir.core.clock` module (`thinking.clock` is the same module object
    # the entitlement service reads), not just the `thinking` module's own
    # calls. A real-time `effective_from` created moments before that patch
    # would then sit in the "future" relative to the frozen NOW and the grant
    # would look not-yet-effective.
    entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=NOW - timedelta(days=1),
        capabilities=[Capability.PARTNER_QUICK_ACTIONS_EXTENDED.value],
    )
    session.flush()


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


def test_free_space_cannot_send_extended_action(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    response = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )

    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert (
        session.execute(select(func.count(SupportGestureRequest.id))).scalar_one()
        == 0
    )


def test_extended_action_is_idempotent_and_projects_notification_only(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _grant_extended_actions(session, couple)
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    request_id = uuid4()

    first = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(request_id)},
        headers=auth(couple["anna_token"]),
    )
    replay = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(request_id)},
        headers=auth(couple["anna_token"]),
    )

    assert first.status_code == replay.status_code == 202
    expected_available_at = (
        (NOW + timedelta(seconds=thinking.SUPPORT_GESTURE_COOLDOWN_SECONDS))
        .isoformat()
        .replace("+00:00", "Z")
    )
    assert first.json() == replay.json() == {
        "kind": "KISS",
        "clientRequestId": str(request_id),
        "availableAt": expected_available_at,
    }

    requests = session.execute(select(SupportGestureRequest)).scalars().all()
    assert len(requests) == 1
    event = session.get(OutboxEvent, requests[0].source_event_id)
    assert event is not None
    assert event.event_type == "PARTNER_KISS"
    assert event.payload.recipient_id == couple["ben"].id
    assert event.payload.target_type is None
    assert event.payload.target_id is None

    service.project_event(session, event)
    service.project_event(session, event)
    session.flush()

    notifications = (
        session.execute(
            select(Notification).where(Notification.source_event_id == event.id)
        )
        .scalars()
        .all()
    )
    assert len(notifications) == 1
    assert notifications[0].kind == NotificationKind.PARTNER_KISS.value
    assert notifications[0].recipient_account_id == couple["ben"].id
    assert notifications[0].target_type is None
    assert notifications[0].target_id is None
    assert (
        session.execute(
            select(func.count(Activity.id)).where(Activity.source_event_id == event.id)
        ).scalar_one()
        == 0
    )


def test_same_extended_action_is_rate_limited_but_distinct_check_in_is_allowed(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _grant_extended_actions(session, couple)
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)

    first = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    duplicate_kind = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    check_in = client.post(
        _url(couple),
        json={"kind": "CHECK_IN", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )

    assert first.status_code == 202
    assert duplicate_kind.status_code == 429
    assert duplicate_kind.json()["code"] == thinking.SUPPORT_GESTURE_COOLDOWN
    assert check_in.status_code == 202

    requests = session.execute(select(SupportGestureRequest)).scalars().all()
    assert {request.kind for request in requests} == {"KISS", "CHECK_IN"}


def test_check_in_is_content_free_and_does_not_disclose_vibe_or_presence(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _grant_extended_actions(session, couple)
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)

    response = client.post(
        _url(couple),
        json={"kind": "CHECK_IN", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 202

    request = session.execute(select(SupportGestureRequest)).scalar_one()
    event = session.get(OutboxEvent, request.source_event_id)
    assert event is not None
    assert event.event_type == "PARTNER_CHECK_IN"
    assert event.payload.model_dump(exclude_none=True) == {
        "recipient_id": couple["ben"].id
    }

    service.project_event(session, event)
    session.flush()
    notification = session.execute(
        select(Notification).where(Notification.source_event_id == event.id)
    ).scalar_one()
    assert notification.kind == NotificationKind.PARTNER_CHECK_IN.value
    assert notification.target_type is None
    assert notification.target_id is None


def test_module_disable_blocks_extended_action_even_with_capability(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _grant_extended_actions(session, couple)
    monkeypatch.setattr(thinking.clock, "now", lambda: NOW)
    _set_support_gestures(client, couple, enabled=False)

    response = client.post(
        _url(couple),
        json={"kind": "KISS", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )

    assert response.status_code == 403
    assert (
        response.json()["code"]
        == space_configuration.SpaceConfigurationErrorCode.MODULE_DISABLED
    )
    assert (
        session.execute(select(func.count(SupportGestureRequest.id))).scalar_one()
        == 0
    )


def test_foreign_space_is_not_exposed_by_entitlement_check(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_extended_actions(session, couple)

    response = client.post(
        _url(couple, space_id=couple["foreign_space"].id),
        json={"kind": "KISS", "clientRequestId": str(uuid4())},
        headers=auth(couple["anna_token"]),
    )

    assert response.status_code == 404
