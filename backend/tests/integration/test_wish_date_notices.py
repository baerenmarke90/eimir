"""Authorized, current shared-Wish date notices and encrypted transport."""

import json
from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from joserfc import jwe
from joserfc.jwk import OctKey
from sqlalchemy import select

from eimir.auth import sessions
from eimir.core import clock
from eimir.engagement import push
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind, PushDelivery
from tests.conftest import auth, requires_database
from tests.integration.test_contextual_push import ENDPOINT, KEY
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import path
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]


def test_current_notice_opens_the_wish_then_acceptance_opens_only_the_plan(client, session, actors):
    provider = FakePushProvider()
    push.providers.register("fcm", provider)
    try:
        for who in ("a", "b"):
            push.register_endpoint(
                session,
                account_id=actors[who].id,
                provider_key="fcm",
                endpoint_value=ENDPOINT,
                preview_key=KEY,
                preview_session_id=sessions.resolve(session, actors[f"token_{who}"])[0].id,
                preview_version=2,
            )
        sender = auth(actors["token_a"])
        recipient = auth(actors["token_b"])
        outsider = auth(actors["token_outsider"])
        created = client.post(
            path(actors, "wishes"),
            headers=sender,
            json={"title": "Stadium tour", "description": "https://example.org/wish"},
        )
        assert created.status_code == 201, created.text
        wish_id = created.json()["id"]
        route = path(actors, f"wishes/{wish_id}/date-proposal")
        start = clock.now() + timedelta(days=3)
        proposed = client.post(
            route,
            headers=sender,
            json={"clientRequestId": str(uuid4()), "plannedStart": start.isoformat()},
        )
        assert proposed.status_code == 200, proposed.text
        engagement.project_pending(session)
        notice = session.scalars(
            select(Notification).where(Notification.kind == NotificationKind.WISH_DATE_PROPOSED)
        ).one()
        delivery = session.scalars(
            select(PushDelivery).where(PushDelivery.notification_id == notice.id)
        ).one()
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        reference = provider.calls[0]["notificationReference"]
        assert "Stadium tour" not in str(reference)
        decoded = jwe.decrypt_compact(
            reference["encryptedPreview"],
            OctKey.import_key({"kty": "oct", "k": KEY}),
            algorithms=["dir", "A256GCM"],
        )
        payload = json.loads(decoded.plaintext)
        assert payload["name"] == actors["a"].display_name
        assert payload["title"] == "Stadium tour"
        assert datetime.fromisoformat(payload["body"]) == start
        assert "example.org" not in decoded.plaintext.decode()

        open_route = path(actors, f"notifications/{notice.id}/open")
        assert client.post(open_route, headers=outsider).status_code == 404
        assert client.post(open_route, headers=sender).status_code == 404
        opened = client.post(open_route, headers=recipient)
        assert opened.status_code == 200, opened.text
        detail = opened.json()
        assert detail["targetType"] == "WISH" and detail["targetId"] == wish_id
        assert datetime.fromisoformat(detail["appointmentStart"]) == start

        proposal_id = proposed.json()["proposal"]["id"]
        accepted = client.post(f"{route}/{proposal_id}/accept", headers=recipient)
        assert accepted.status_code == 200, accepted.text
        engagement.project_pending(session)
        plan_id = accepted.json()["planId"]
        assert client.post(open_route, headers=recipient).status_code == 404
        confirmations = session.scalars(
            select(Notification).where(
                Notification.kind.in_(
                    [NotificationKind.WISH_DATE_ACCEPTED, NotificationKind.PLAN_CREATED]
                )
            )
        ).all()
        assert len(confirmations) == 1
        assert confirmations[0].kind == NotificationKind.WISH_DATE_ACCEPTED
        confirmation = client.post(
            path(actors, f"notifications/{confirmations[0].id}/open"), headers=sender
        )
        assert confirmation.status_code == 200, confirmation.text
        assert confirmation.json()["targetType"] == "PLAN"
        assert confirmation.json()["targetId"] == plan_id
    finally:
        push.providers.unregister("fcm")


def test_withdrawing_a_proposal_invalidates_its_unread_notice_and_queued_push(
    client, session, actors
):
    provider = FakePushProvider()
    push.providers.register("planning-test", provider)
    try:
        push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="planning-test",
            endpoint_value="proposal-device",
        )
        sender = auth(actors["token_a"])
        recipient = auth(actors["token_b"])
        wish = client.post(path(actors, "wishes"), headers=sender, json={"title": "Coffee"})
        assert wish.status_code == 201, wish.text
        route = path(actors, f"wishes/{wish.json()['id']}/date-proposal")
        proposed = client.post(
            route,
            headers=sender,
            json={
                "clientRequestId": str(uuid4()),
                "plannedStart": (clock.now() + timedelta(days=3)).isoformat(),
            },
        )
        assert proposed.status_code == 200, proposed.text
        engagement.project_pending(session)
        notice = session.scalars(
            select(Notification).where(Notification.kind == NotificationKind.WISH_DATE_PROPOSED)
        ).one()
        delivery = session.scalars(
            select(PushDelivery).where(PushDelivery.notification_id == notice.id)
        ).one()
        count_url = path(actors, "notifications/unread-count")
        assert client.get(count_url, headers=recipient).json()["unreadCount"] == 1
        proposal_id = proposed.json()["proposal"]["id"]
        withdrawn = client.post(f"{route}/{proposal_id}/withdraw", headers=sender)
        assert withdrawn.status_code == 204, withdrawn.text
        assert client.get(count_url, headers=recipient).json()["unreadCount"] == 0
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert delivery.last_error_code == "PUSH_TARGET_UNAVAILABLE"
        assert provider.calls == []
    finally:
        push.providers.unregister("planning-test")
