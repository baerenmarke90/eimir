"""Photo reactions persist and notify through the shared Memory's authorization boundary."""

from datetime import UTC, datetime, time
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.engagement import push, quiet_hours_preferences
from eimir.engagement import service as engagement
from eimir.engagement.models import (
    Notification,
    NotificationKind,
    PushDelivery,
    PushDeliveryStatus,
)
from eimir.jobs.errors import DeferredJobError
from eimir.memories.models import Memory
from eimir.outbox.models import OutboxEvent
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_attachment_binding import (
    base_path,
    if_match,
    memory,
    ready_attachment,
)
from tests.integration.test_attachment_binding import (
    couple as _couple,
)
from tests.integration.test_thinking_push import FakePushProvider
from tests.support.encryption import EncryptionConfigurator

pytestmark = [pytest.mark.integration, requires_database]
couple = _couple


@pytest.fixture(autouse=True, params=["disabled", "required"])
def reaction_storage(request: pytest.FixtureRequest, encryption: EncryptionConfigurator) -> None:
    """Exercise the Cloud encryption mode as well as ordinary test storage."""
    encryption.apply(request.param)


@pytest.fixture
def photo_memory(client, couple, session):  # type: ignore[no-untyped-def]
    photo = ready_attachment(client, couple, session)
    created = memory(client, couple)
    path = f"{base_path(couple['space'].id)}/memories/{created['id']}"
    bound = client.put(
        f"{path}/attachments",
        json={"attachments": [{"attachmentId": photo, "position": 0, "isSensitive": True}]},
        headers=if_match(couple["token_a"], created["version"]),
    )
    assert bound.status_code == 200
    return path, photo, bound.json()


def test_each_partner_sets_replaces_and_removes_only_their_own_reaction(
    client, couple, photo_memory, session
):  # type: ignore[no-untyped-def]
    path, photo, _ = photo_memory
    endpoint = f"{path}/attachments/{photo}/reaction"
    first = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_b"]))
    assert first.status_code == 200
    assert first.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": True}
    ]
    session.expire_all()
    replay = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_b"]))
    assert replay.json()["version"] == first.json()["version"]
    other = client.get(path, headers=auth(couple["token_a"]))
    assert other.json()["attachments"][0]["reactions"][0]["own"] is False
    both = client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_a"]))
    assert both.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 2, "own": True}
    ]
    replaced = client.put(endpoint, json={"reaction": "LIKE"}, headers=auth(couple["token_b"]))
    assert replaced.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": False},
        {"reaction": "LIKE", "count": 1, "own": True},
    ]
    removed = client.put(endpoint, json={"reaction": None}, headers=auth(couple["token_b"]))
    assert removed.json()["attachments"][0]["reactions"] == [
        {"reaction": "LOVE", "count": 1, "own": False}
    ]
    replay = client.put(endpoint, json={"reaction": None}, headers=auth(couple["token_b"]))
    assert replay.json()["version"] == removed.json()["version"]


def test_editor_preserves_reactions_and_detaching_prunes_them(
    client, couple, session, photo_memory
):  # type: ignore[no-untyped-def]
    path, photo, initial = photo_memory
    reacted = client.put(
        f"{path}/attachments/{photo}/reaction",
        json={"reaction": "CELEBRATE"},
        headers=auth(couple["token_b"]),
    ).json()
    stale = client.patch(
        path, json={"title": "Edited"}, headers=if_match(couple["token_a"], initial["version"])
    )
    assert stale.status_code == 409
    edited = client.patch(
        path, json={"title": "Edited"}, headers=if_match(couple["token_a"], reacted["version"])
    )
    assert edited.status_code == 200
    assert edited.json()["attachments"][0]["reactions"][0]["reaction"] == "CELEBRATE"
    detached = client.put(
        f"{path}/attachments",
        json={"attachments": []},
        headers=if_match(couple["token_a"], edited.json()["version"]),
    )
    assert detached.status_code == 200
    session.expire_all()
    assert session.get(Memory, UUID(initial["id"])).payload.photo_reactions == []


def test_rejects_foreign_unbound_missing_and_invalid_photo_targets(
    client, couple, session, photo_memory
):  # type: ignore[no-untyped-def]
    path, photo, _ = photo_memory
    unbound = ready_attachment(client, couple, session)
    for target in [unbound, str(uuid4()), "invalid"]:
        result = client.put(
            f"{path}/attachments/{target}/reaction",
            json={"reaction": "LOVE"},
            headers=auth(couple["token_b"]),
        )
        assert result.status_code == 404
    other_memory = memory(client, couple)
    other_path = f"{base_path(couple['space'].id)}/memories/{other_memory['id']}"
    assert (
        client.put(
            f"{other_path}/attachments/{photo}/reaction",
            json={"reaction": "LOVE"},
            headers=auth(couple["token_a"]),
        ).status_code
        == 404
    )
    outsider = make_account(session, "Outside")
    make_space(session, outsider)
    token = sign_in(session, outsider)
    endpoint = f"{path}/attachments/{photo}/reaction"
    assert client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(token)).status_code == 404
    assert client.put(endpoint, json={"reaction": "LOVE"}).status_code == 401
    for body in [
        {"reaction": "CUSTOM"},
        {},
        {"reaction": "LOVE", "accountId": str(couple["anna"].id)},
    ]:
        assert client.put(endpoint, json=body, headers=auth(couple["token_b"])).status_code == 422
    assert (
        client.get(path, headers=auth(couple["token_a"])).json()["attachments"][0]["reactions"]
        == []
    )


@pytest.fixture
def reaction_push(couple, session):  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("reaction-test", provider)
    for member in ("anna", "ben"):
        push.register_endpoint(
            session,
            account_id=couple[member].id,
            provider_key="reaction-test",
            endpoint_value=f"secret-{member}",
        )
    yield provider
    push.providers.unregister("reaction-test")


def test_incoming_reactions_coalesce_with_one_push_and_retraction_removes_notice(
    client, couple, photo_memory, reaction_push, session, monkeypatch
):  # type: ignore[no-untyped-def]
    source, photo, _ = photo_memory
    endpoint = f"{source}/attachments/{photo}/reaction"
    context = AuthorizationContext(couple["anna"].id, couple["space"].id)
    now = datetime(2026, 11, 13, 23, tzinfo=UTC)
    monkeypatch.setattr(clock, "now", lambda: now)
    couple["anna"].timezone = "UTC"
    quiet_hours_preferences.set_own_window(
        session,
        account_id=context.account_id,
        window=quiet_hours_preferences.QuietHoursWindow(time(22), time(7)),
    )

    def project():
        for event in session.scalars(
            select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
        ):
            engagement.project_event(session, event)
        session.flush()

    assert (
        client.put(endpoint, json={"reaction": "LOVE"}, headers=auth(couple["token_b"])).status_code
        == 200
    )
    project()
    notice = session.scalar(
        select(Notification).where(Notification.kind == NotificationKind.PHOTO_REACTION.value)
    )
    assert notice is not None and notice.recipient_account_id == couple["anna"].id
    delivery = session.scalars(select(PushDelivery)).one()
    assert delivery.notification_id == notice.id
    with pytest.raises(DeferredJobError):
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.deferred_until == datetime(2026, 11, 14, 7, tzinfo=UTC)
    assert not reaction_push.calls
    now = datetime(2026, 11, 14, 7, tzinfo=UTC)
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    project()
    assert delivery.status == PushDeliveryStatus.SUCCEEDED.value
    assert len(reaction_push.calls) == 1
    assert reaction_push.calls[0]["endpoint"] == "secret-anna"
    assert reaction_push.calls[0]["notificationReference"] == {
        "id": str(notice.id),
        "kind": "PHOTO_REACTION",
        "locale": "de",
    }
    notice_path = f"{base_path(couple['space'].id)}/notifications/{notice.id}/open"
    assert client.post(notice_path, headers=auth(couple["token_b"])).status_code == 404
    opened = client.post(notice_path, headers=auth(couple["token_a"]))
    assert opened.status_code == 200
    assert opened.json()["targetType"] == "MEMORY"
    assert opened.json()["targetId"] == source.split("/")[-1]
    engagement.mark_notification_read(session, context, notice.id)
    project()
    session.refresh(notice)
    assert notice.read_at is not None
    assert (
        client.put(endpoint, json={"reaction": "LIKE"}, headers=auth(couple["token_b"])).status_code
        == 200
    )
    project()
    session.refresh(notice)
    assert notice.read_at is None
    assert session.scalar(select(func.count()).select_from(Notification)) == 1
    assert session.scalar(select(func.count()).select_from(PushDelivery)) == 1
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert len(reaction_push.calls) == 1
    assert (
        client.put(endpoint, json={"reaction": None}, headers=auth(couple["token_b"])).status_code
        == 200
    )
    project()
    assert not engagement.read_notifications(session, context).items


@pytest.mark.parametrize("dismissal", ["preference", "retracted", "detached", "self"])
def test_reaction_push_respects_recipient_choice_and_live_source(
    client, couple, photo_memory, reaction_push, session, dismissal
):  # type: ignore[no-untyped-def]
    source, photo, _ = photo_memory
    token_a = couple["token_a"]
    token_b = couple["token_b"]
    endpoint = f"{source}/attachments/{photo}/reaction"
    if dismissal == "preference":
        changed = client.patch(
            "/api/v1/notification-preferences/COMMENT_CREATED/PUSH",
            json={"enabled": False},
            headers=auth(token_a),
        )
        assert changed.status_code == 200
    reacted = client.put(
        endpoint,
        json={"reaction": "LOVE"},
        headers=auth(token_a if dismissal == "self" else token_b),
    )
    assert reacted.status_code == 200
    engagement.project_pending(session, limit=100)
    if dismissal == "self":
        assert not session.scalars(select(PushDelivery)).all()
        return
    delivery = session.scalars(select(PushDelivery)).one()
    if dismissal == "retracted":
        removed = client.put(endpoint, json={"reaction": None}, headers=auth(token_b))
        assert removed.status_code == 200
    if dismissal == "detached":
        detached = client.put(
            f"{source}/attachments",
            json={"attachments": []},
            headers=if_match(token_a, reacted.json()["version"]),
        )
        assert detached.status_code == 200
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    assert delivery.status == PushDeliveryStatus.UNAVAILABLE.value
    assert not reaction_push.calls
