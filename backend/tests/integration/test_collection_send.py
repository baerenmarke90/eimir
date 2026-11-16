"""Sending a shared list to the partner (#1907 E2) against real PostgreSQL."""

from __future__ import annotations

import json
from uuid import UUID

import pytest
from sqlalchemy import func, select

from eimir.engagement import push, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from eimir.outbox.models import OutboxEvent
from tests.conftest import auth, requires_database
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import path
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]

TITLE = "Geschenke für Mama"


def create_list(client, actors, title=TITLE):  # type: ignore[no-untyped-def]
    created = client.post(
        path(actors, "collections"), headers=auth(actors["token_a"]), json={"title": title}
    )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def send(client, actors, collection_id, token="token_a"):  # type: ignore[no-untyped-def]
    return client.post(
        path(actors, f"collections/{collection_id}/send"), headers=auth(actors[token])
    )


def project_all(session):  # type: ignore[no-untyped-def]
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def partner_selection(client, actors):  # type: ignore[no-untyped-def]
    response = client.get(path(actors, "dashboard/preferences"), headers=auth(actors["token_b"]))
    assert response.status_code == 200, response.text
    module = next(m for m in response.json()["items"] if m["moduleKey"] == "pinned_collection")
    return module["selectedCollectionIds"], module["visible"]


def test_send_adds_the_list_to_the_partner_and_notifies_once_without_the_title(
    client, session, actors
):  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("list-send-test", provider)
    try:
        push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="list-send-test",
            endpoint_value="secret-list-send-test",
        )
        first = create_list(client, actors, "Eins")
        second = create_list(client, actors)
        # The partner already shows another list; it keeps its place.
        pin = client.patch(
            path(actors, "dashboard/preferences/pinned_collection"),
            headers=auth(actors["token_b"]),
            json={"selectedCollectionIds": [first], "visible": True},
        )
        assert pin.status_code == 200, pin.text

        sent = send(client, actors, second)
        assert sent.status_code == 204, sent.text
        assert partner_selection(client, actors) == ([first, second], True)
        # The sender's own Wir is untouched.
        own = client.get(path(actors, "dashboard/preferences"), headers=auth(actors["token_a"]))
        own_module = next(m for m in own.json()["items"] if m["moduleKey"] == "pinned_collection")
        assert not own_module.get("selectedCollectionIds")

        events = list(
            session.scalars(select(OutboxEvent).where(OutboxEvent.event_type == "COLLECTION_SENT"))
        )
        assert len(events) == 1 and events[0].payload.recipient_id == actors["b"].id
        assert TITLE not in events[0].payload.model_dump_json()
        project_all(session)
        project_all(session)
        notices = list(
            session.scalars(
                select(Notification).where(
                    Notification.kind == NotificationKind.COLLECTION_SENT.value
                )
            )
        )
        assert len(notices) == 1
        assert notices[0].recipient_account_id == actors["b"].id
        assert str(notices[0].target_id) == second
        deliveries = list(
            session.scalars(
                select(PushDelivery).where(PushDelivery.notification_id == notices[0].id)
            )
        )
        assert len(deliveries) == 1
        push.handle_delivery(session, {"deliveryId": str(deliveries[0].id)})
        assert len(provider.calls) == 1
        assert TITLE not in json.dumps(provider.calls)
        preview = json.loads(
            push_preview.for_notification(session, notices[0], digest=False, version=2) or "{}"
        )
        assert preview["title"] == "" and preview["body"] == ""
        assert preview["kind"] == "COLLECTION_SENT"
        # Opening the notification from the app resolves to the shared list.
        listed = client.get(path(actors, "notifications"), headers=auth(actors["token_b"]))
        item = next(i for i in listed.json()["items"] if i["kind"] == "COLLECTION_SENT")
        assert item["targetType"] == "COLLECTION" and item["targetId"] == second
    finally:
        push.providers.clear()


def test_resend_is_idempotent_silent_within_the_pacing_window_and_never_duplicates(
    client, session, actors
):  # type: ignore[no-untyped-def]
    collection_id = create_list(client, actors)
    assert send(client, actors, collection_id).status_code == 204
    assert send(client, actors, collection_id).status_code == 204
    assert partner_selection(client, actors)[0] == [collection_id]
    count = session.scalar(
        select(func.count())
        .select_from(OutboxEvent)
        .where(OutboxEvent.event_type == "COLLECTION_SENT")
    )
    assert count == 1
    # The other partner may send the same list back; that is a different gesture.
    assert send(client, actors, collection_id, "token_b").status_code == 204
    assert (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.event_type == "COLLECTION_SENT")
        )
        == 2
    )


def test_recipient_can_switch_the_notice_off_and_the_list_is_still_added(client, session, actors):  # type: ignore[no-untyped-def]
    provider = FakePushProvider()
    push.providers.register("list-send-off", provider)
    try:
        push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="list-send-off",
            endpoint_value="secret-list-send-off",
        )
        off = client.patch(
            "/api/v1/notification-preferences/COLLECTION_SENT/PUSH",
            headers=auth(actors["token_b"]),
            json={"enabled": False},
        )
        assert off.status_code == 200, off.text
        collection_id = create_list(client, actors)
        assert send(client, actors, collection_id).status_code == 204
        project_all(session)
        assert partner_selection(client, actors)[0] == [collection_id]
        # Whatever was queued is re-evaluated against the switch before the provider.
        for delivery in session.scalars(select(PushDelivery)):
            push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert provider.calls == []
    finally:
        push.providers.clear()


def test_send_requires_a_readable_list_and_a_partner(client, session, actors):  # type: ignore[no-untyped-def]
    collection_id = create_list(client, actors)
    assert send(client, actors, collection_id, "token_outsider").status_code == 404
    assert send(client, actors, str(UUID(int=7))).status_code == 404
    other = client.post(
        f"/api/v1/spaces/{actors['foreign'].id}/collections",
        headers=auth(actors["token_outsider"]),
        json={"title": "Alone"},
    )
    assert other.status_code == 201, other.text
    lonely = client.post(
        f"/api/v1/spaces/{actors['foreign'].id}/collections/{other.json()['id']}/send",
        headers=auth(actors["token_outsider"]),
    )
    assert lonely.status_code == 409
    assert lonely.json()["code"] == "COLLECTION_NO_PARTNER"
