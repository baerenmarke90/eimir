"""PostgreSQL/HTTP single-view, consent, notification and tenant acceptance."""

from __future__ import annotations

import base64
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import NotFoundError
from eimir.engagement import notification_preferences, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Activity, Notification, NotificationKind
from eimir.entitlements.models import EntitlementGrant
from eimir.once_messages import service
from eimir.once_messages.models import OnceMessage
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode().rstrip("=")


def public_key() -> dict[str, str]:
    key = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048).public_key().public_numbers()
    )
    return {"kty": "RSA", "alg": "RSA-OAEP-256", "n": b64(key.n.to_bytes(256, "big")), "e": "AQAB"}


def envelope(key_id) -> dict:  # type: ignore[no-untyped-def, type-arg]
    # Opaque framing only. Real browser encryption/decryption is tested separately.
    return {
        "protected": b64(json.dumps({"alg": "RSA-OAEP-256", "enc": "A256GCM"}).encode()),
        "iv": b64(b"i" * 12),
        "tag": b64(b"t" * 16),
        "ciphertext": b64(b"encrypted-content"),
        "recipients": [{"header": {"kid": str(key_id)}, "encrypted_key": b64(b"k" * 256)}],
    }


@pytest.fixture
def actors(session):  # type: ignore[no-untyped-def]
    first, second, outsider = [
        make_account(session, name) for name in ("First", "Second", "Outsider")
    ]
    space = make_space(session, first)
    relationship.add_member(session, space.id, second)
    foreign = make_space(session, outsider)
    a, b = AuthorizationContext(first.id, space.id), AuthorizationContext(second.id, space.id)
    key_a, key_b = uuid4(), uuid4()
    for context, key_id in ((a, key_a), (b, key_b)):
        service.set_reception(
            session, context, enable=True, device_id=key_id, public_jwk=public_key()
        )
    grant = EntitlementGrant(
        space_id=space.id,
        account_id=first.id,
        source_type="TEST_FIXTURE",
        status="ACTIVE",
        tier="PREMIUM",
        effective_from=clock.now() - timedelta(days=1),
    )
    session.add(grant)
    session.flush()
    return dict(
        first=first,
        second=second,
        outsider=outsider,
        space=space,
        foreign=foreign,
        a=a,
        b=b,
        key_a=key_a,
        key_b=key_b,
        grant=grant,
        token_a=sign_in(session, first),
        token_b=sign_in(session, second),
        token_outsider=sign_in(session, outsider),
    )


def sent(session, actors):  # type: ignore[no-untyped-def]
    return service.create(
        session,
        actors["a"],
        request_id=uuid4(),
        recipient_id=actors["second"].id,
        jwe=envelope(actors["key_b"]),
    )


def test_http_is_sealed_until_deliberate_claim_and_ack_erases(session, client, actors):  # type: ignore[no-untyped-def]
    message = sent(session, actors)
    prefix = f"/api/v1/spaces/{actors['space'].id}/once-messages"
    get = client.get(f"{prefix}/{message.id}", headers=auth(actors["token_b"]))
    assert get.status_code == 200, get.text
    assert get.headers["cache-control"] == "private, no-store"
    assert "envelope" not in get.json() and "ciphertext" not in get.text
    claim = {"deviceId": str(actors["key_b"]), "token": str(uuid4())}
    opened = client.post(f"{prefix}/{message.id}/open", headers=auth(actors["token_b"]), json=claim)
    assert opened.status_code == 200, opened.text
    assert opened.json()["envelope"] == envelope(actors["key_b"])
    retry = client.post(f"{prefix}/{message.id}/open", headers=auth(actors["token_b"]), json=claim)
    assert retry.status_code == 200
    denied = client.post(
        f"{prefix}/{message.id}/open",
        headers=auth(actors["token_b"]),
        json={**claim, "token": str(uuid4())},
    )
    assert denied.status_code == 404
    assert client.get(prefix, headers=auth(actors["token_b"])).json()["items"] == []
    ack = client.post(
        f"{prefix}/{message.id}/acknowledge",
        headers=auth(actors["token_b"]),
        json={"token": claim["token"]},
    )
    assert ack.status_code == 204, ack.text
    session.refresh(message)
    assert message.byte_size == 0 and message.payload.jwe == {}
    assert (
        client.post(
            f"{prefix}/{message.id}/open", headers=auth(actors["token_b"]), json=claim
        ).status_code
        == 404
    )


def test_pro_only_creation_and_non_destructive_downgrade(session, client, actors):  # type: ignore[no-untyped-def]
    message = sent(session, actors)
    actors["grant"].status = "EXPIRED"
    session.flush()
    prefix = f"/api/v1/spaces/{actors['space'].id}/once-messages"
    create = client.post(
        prefix,
        headers=auth(actors["token_a"]),
        json={
            "requestId": str(uuid4()),
            "recipientId": str(actors["second"].id),
            "envelope": envelope(actors["key_b"]),
        },
    )
    assert create.status_code == 403
    assert create.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    opened = service.claim(
        session, actors["b"], message.id, device_id=actors["key_b"], token=uuid4()
    )
    assert opened.byte_size > 0


def test_idempotent_send_and_no_plaintext_projections(session, client, actors):  # type: ignore[no-untyped-def]
    request_id = uuid4()
    args = dict(
        request_id=request_id, recipient_id=actors["second"].id, jwe=envelope(actors["key_b"])
    )
    first = service.create(session, actors["a"], **args)
    assert service.create(session, actors["a"], **args).id == first.id
    engagement.project_pending(session, limit=100)
    engagement.project_pending(session, limit=100)
    assert session.scalar(select(func.count()).select_from(OnceMessage)) == 1
    notifications = list(
        session.scalars(select(Notification).where(Notification.kind == "ONCE_MESSAGE_RECEIVED"))
    )
    assert len(notifications) == 1
    assert (
        session.scalar(
            select(func.count()).select_from(Activity).where(Activity.target_id == first.id)
        )
        == 0
    )
    event = session.scalar(select(OutboxEvent).where(OutboxEvent.subject_id == first.id))
    assert event is not None
    assert "ciphertext" not in json.dumps(event.payload.model_dump(mode="json"))
    assert push_preview.for_notification(session, notifications[0], digest=False, version=2) is None
    assert (
        notification_preferences.email_enabled(
            session,
            account_id=actors["second"].id,
            kind=NotificationKind.ONCE_MESSAGE_RECEIVED.value,
        )
        is False
    )
    assert engagement.unread_count(session, actors["b"]) == 1
    opened_notice = client.post(
        f"/api/v1/spaces/{actors['space'].id}/notifications/{notifications[0].id}/open",
        headers=auth(actors["token_b"]),
    )
    assert opened_notice.status_code == 200, opened_notice.text
    assert opened_notice.json()["targetType"] == "ONCE_MESSAGE"
    assert "envelope" not in opened_notice.text
    assert first.claim_hash is None and first.byte_size > 0

    service.discard(session, actors["a"], first.id)
    session.flush()
    assert engagement.unread_count(session, actors["b"]) == 0


def test_foreign_account_wrong_sender_and_device_cannot_open(session, client, actors):  # type: ignore[no-untyped-def]
    message = sent(session, actors)
    prefix = f"/api/v1/spaces/{actors['space'].id}/once-messages/{message.id}"
    for token in (actors["token_a"], actors["token_outsider"]):
        assert client.get(prefix, headers=auth(token)).status_code == 404
        assert (
            client.post(
                prefix + "/open",
                headers=auth(token),
                json={"deviceId": str(actors["key_b"]), "token": str(uuid4())},
            ).status_code
            == 404
        )
    assert (
        client.post(
            prefix + "/open",
            headers=auth(actors["token_b"]),
            json={"deviceId": str(actors["key_a"]), "token": str(uuid4())},
        ).status_code
        == 404
    )
    assert client.get(prefix).status_code == 401
    assert service.get_sealed(session, actors["b"], message.id).id == message.id


def test_consent_revocation_and_membership_end_purge_pending_content(session, actors):  # type: ignore[no-untyped-def]
    message = sent(session, actors)
    service.set_reception(session, actors["b"], enable=False, device_id=None, public_jwk=None)
    assert session.get(OnceMessage, message.id).payload.jwe == {}
    with pytest.raises(NotFoundError):
        service.get_sealed(session, actors["b"], message.id)
    service.set_reception(
        session, actors["b"], enable=True, device_id=uuid4(), public_jwk=public_key()
    )
    actors["key_b"] = service.current_keys(
        session,
        next(
            m for m in service.members(session, actors["b"]) if m.account_id == actors["second"].id
        ),
    )[0].id
    message = sent(session, actors)
    member = next(
        m
        for m in relationship.active_memberships(session, actors["space"].id)
        if m.account_id == actors["second"].id
    )
    relationship.end_membership(session, member)
    assert session.get(OnceMessage, message.id) is None


def test_expiry_and_crashed_viewer_cleanup(session, actors, monkeypatch):  # type: ignore[no-untyped-def]
    message = sent(session, actors)
    opened_at = clock.now()
    service.claim(session, actors["b"], message.id, device_id=actors["key_b"], token=uuid4())
    monkeypatch.setattr(clock, "now", lambda: opened_at + timedelta(minutes=6))
    service.cleanup(session, {"message_id": str(message.id)})
    assert message.payload.jwe == {} and message.byte_size == 0
    monkeypatch.setattr(clock, "now", lambda: opened_at + timedelta(days=2))
    service.prune_expired(session)
    session.flush()
    assert session.get(OnceMessage, message.id) is None


def test_competing_openers_receive_one_view(production_client):  # type: ignore[no-untyped-def]
    _, maker = production_client
    with maker.begin() as setup:
        first, second = make_account(setup, "First"), make_account(setup, "Second")
        space = make_space(setup, first)
        relationship.add_member(setup, space.id, second)
        a, b = AuthorizationContext(first.id, space.id), AuthorizationContext(second.id, space.id)
        key_id = uuid4()
        service.set_reception(setup, a, enable=True, device_id=uuid4(), public_jwk=public_key())
        service.set_reception(setup, b, enable=True, device_id=key_id, public_jwk=public_key())
        setup.add(
            EntitlementGrant(
                space_id=space.id,
                source_type="TEST_FIXTURE",
                status="ACTIVE",
                tier="PREMIUM",
                effective_from=clock.now() - timedelta(days=1),
            )
        )
        setup.flush()
        message = service.create(
            setup, a, request_id=uuid4(), recipient_id=second.id, jwe=envelope(key_id)
        )
        message_id = message.id

    def open_it() -> bool:
        try:
            with maker.begin() as transaction:
                service.claim(transaction, b, message_id, device_id=key_id, token=uuid4())
            return True
        except NotFoundError:
            return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: open_it(), range(2)))
    assert sorted(results) == [False, True]


def test_discreet_push_still_delivers_when_device_has_rich_previews(session, actors):  # type: ignore[no-untyped-def]
    from eimir.auth import sessions
    from eimir.engagement import push
    from eimir.engagement.models import PushDelivery
    from tests.integration.test_contextual_push import ENDPOINT, KEY
    from tests.integration.test_thinking_push import FakePushProvider

    provider = FakePushProvider()
    push.providers.register("fcm", provider)
    try:
        push.register_endpoint(
            session,
            account_id=actors["second"].id,
            provider_key="fcm",
            endpoint_value=ENDPOINT,
            preview_key=KEY,
            preview_session_id=sessions.resolve(session, actors["token_b"])[0].id,
        )
        session.flush()
        message = sent(session, actors)
        engagement.project_pending(session, limit=100)
        session.flush()
        notice = session.scalar(select(Notification).where(Notification.target_id == message.id))
        delivery = session.scalar(
            select(PushDelivery).where(PushDelivery.notification_id == notice.id)
        )
        assert delivery is not None
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(provider.calls) == 1
        reference = provider.calls[0]["notificationReference"]
        assert set(reference) == {"id", "kind", "locale"}
        assert "encryptedPreview" not in reference
        assert "ciphertext" not in json.dumps(provider.calls)
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(provider.calls) == 1
        service.set_reception(session, actors["b"], enable=False, device_id=None, public_jwk=None)
        engagement.project_pending(session, limit=100)
        session.flush()
        assert (
            session.scalar(select(Notification).where(Notification.target_id == message.id)) is None
        )
    finally:
        push.providers.clear()


def test_stale_reception_cannot_reenable_after_revocation(session, client, actors):  # type: ignore[no-untyped-def]
    from eimir.once_messages.models import OnceReception

    message = sent(session, actors)
    route = f"/api/v1/spaces/{actors['space'].id}/once-messages/reception"
    disabled = client.put(
        route, headers=auth(actors["token_b"]), json={"enabled": False, "expectedVersion": 1}
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["receptionVersion"] == 2
    stale = client.put(
        route,
        headers=auth(actors["token_b"]),
        json={
            "enabled": True,
            "expectedVersion": 1,
            "deviceId": str(uuid4()),
            "publicJwk": public_key(),
        },
    )
    assert stale.status_code == 409
    assert stale.json()["code"] == "ONCE_RECEPTION_CHANGED"
    assert session.get(OnceReception, (actors["space"].id, actors["second"].id)).enabled is False
    assert session.get(OnceMessage, message.id).payload.jwe == {}


def test_replaying_an_old_send_after_reconsent_does_not_restore_destroyed_content(session, actors):  # type: ignore[no-untyped-def]
    from eimir.once_messages.models import OnceDevice

    key = dict(session.get(OnceDevice, actors["key_b"]).public_jwk)
    request = uuid4()
    args = dict(request_id=request, recipient_id=actors["second"].id, jwe=envelope(actors["key_b"]))
    message = service.create(session, actors["a"], **args)
    service.set_reception(
        session, actors["b"], enable=False, device_id=None, public_jwk=None, expected_version=1
    )
    service.set_reception(
        session,
        actors["b"],
        enable=True,
        device_id=actors["key_b"],
        public_jwk=key,
        expected_version=2,
    )
    replay = service.create(session, actors["a"], **args)
    assert replay.id == message.id and replay.payload.jwe == {} and replay.byte_size == 0
    with pytest.raises(NotFoundError):
        service.get_sealed(session, actors["b"], message.id)
    assert (
        session.scalar(
            select(func.count())
            .select_from(OutboxEvent)
            .where(OutboxEvent.subject_id == message.id)
        )
        == 1
    )
