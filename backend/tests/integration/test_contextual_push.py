"""Real database/domain/policy boundary for encrypted, recipient-owned previews."""

from __future__ import annotations

import base64
import importlib.util
import json
from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from joserfc import jwe
from joserfc.jwk import OctKey
from sqlalchemy import inspect, select, text

from eimir.auth import sessions
from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.errors import UnauthenticatedError
from eimir.db.base import Base
from eimir.engagement import push, push_preview
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, PushDelivery, PushPreviewSecret
from eimir.outbox.models import OutboxEvent
from eimir.reminders.models import Reminder
from tests.conftest import auth, requires_database
from tests.integration.test_shared_experiences import actors as actors
from tests.integration.test_shared_experiences import path
from tests.integration.test_thinking_push import FakePushProvider

pytestmark = [pytest.mark.integration, requires_database]
KEY = base64.urlsafe_b64encode(bytes(range(32))).decode().rstrip("=")
ENDPOINT = json.dumps(
    {"fid": "c" + "a" * 21, "activationId": "a056af57-e809-465f-8173-e17c23cd408a"},
    separators=(",", ":"),
)


def create(client, actors):
    response = client.post(
        path(actors, "reminders"),
        headers=auth(actors["token_a"]),
        json={
            "title": "Synthetic shared reminder",
            "description": "Never sent as preview body",
            "schedule": {"type": "ONCE", "at": (clock.now() + timedelta(hours=1)).isoformat()},
            "offsets": [0],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_creation_uses_existing_pipeline_encrypts_preview_and_deletion_reauthorizes(
    client, session, actors, encryption
):
    encryption.apply("required")
    provider = FakePushProvider()
    push.providers.register("fcm", provider)
    try:
        endpoint = push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="fcm",
            endpoint_value=ENDPOINT,
            preview_key=KEY,
            preview_session_id=sessions.resolve(session, actors["token_b"])[0].id,
        )
        session.flush()
        secret = session.scalar(select(PushPreviewSecret))
        assert secret.crypto_version == 2
        raw = session.scalar(text("SELECT payload::text FROM push_preview_secrets"))
        assert KEY not in raw
        reminder = create(client, actors)
        event = session.scalar(
            select(OutboxEvent).where(OutboxEvent.subject_id == UUID(reminder["id"]))
        )
        assert reminder["title"] not in event.payload.model_dump_json()
        engagement.project_event(session, event)
        engagement.project_event(session, event)
        session.flush()
        notices = list(
            session.scalars(select(Notification).where(Notification.kind == "REMINDER_CREATED"))
        )
        assert len(notices) == 1
        notice = notices[0]
        assert notice.recipient_account_id == actors["b"].id
        assert notice.actor_id == actors["a"].id
        delivery = session.scalar(
            select(PushDelivery).where(PushDelivery.notification_id == notice.id)
        )
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(provider.calls) == 1
        reference = provider.calls[0]["notificationReference"]
        assert "preview" not in reference
        decoded = jwe.decrypt_compact(
            reference["encryptedPreview"],
            OctKey.import_key({"kty": "oct", "k": KEY}),
            algorithms=["dir", "A256GCM"],
        )
        data = json.loads(decoded.plaintext)
        assert data["name"] == actors["a"].display_name
        assert data["title"] == reminder["title"]
        assert data["notificationId"] == str(notice.id)
        assert data["kind"] == "REMINDER_CREATED" and data["targetType"] == "REMINDER"
        assert "Never sent as preview body" not in decoded.plaintext.decode()
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        assert len(provider.calls) == 1
        context = AuthorizationContext(actors["b"].id, actors["space"].id)
        assert push_preview.for_notification(session, notice, digest=False) is not None
        assert (
            client.get(
                path(actors, f"reminders/{reminder['id']}"), headers=auth(actors["token_outsider"])
            ).status_code
            == 404
        )
        deleted = client.delete(
            path(actors, f"reminders/{reminder['id']}"),
            headers={
                **auth(actors["token_a"]),
                "If-Match": f'"{reminder["version"]}"',
            },
        )
        assert deleted.status_code == 204
        assert not engagement.notification_target_available(session, notice, context)
        assert push_preview.for_notification(session, notice, digest=False) is None
        assert (
            client.post(
                path(actors, f"notifications/{notice.id}/open"), headers=auth(actors["token_b"])
            ).status_code
            == 404
        )
        assert push.revoke_endpoint(session, account_id=actors["b"].id, endpoint_id=endpoint.id)
        session.flush()
        assert session.scalar(select(PushPreviewSecret)) is None
    finally:
        push.providers.clear()


def test_legacy_reregistration_removes_preview_capability_without_changing_endpoint(
    session, actors
):
    endpoint = push.register_endpoint(
        session,
        account_id=actors["b"].id,
        provider_key="fcm",
        endpoint_value=ENDPOINT,
        preview_key=KEY,
        preview_session_id=sessions.resolve(session, actors["token_b"])[0].id,
    )
    session.flush()
    assert session.scalar(select(PushPreviewSecret)) is not None
    legacy = push.register_endpoint(
        session, account_id=actors["b"].id, provider_key="fcm", endpoint_value=ENDPOINT
    )
    session.flush()
    assert legacy.id == endpoint.id
    assert session.scalar(select(PushPreviewSecret)) is None


@pytest.mark.parametrize(
    "family_state", ["revoked", "inactive", "absolute", "deleted", "access-expired", "rotated"]
)
def test_delivery_rechecks_bound_family_and_fresh_login_rebinds_same_endpoint(
    client, session, actors, family_state
):
    family, tokens = sessions.start_session(session, actors["b"])
    session.flush()
    endpoint = push.register_endpoint(
        session,
        account_id=actors["b"].id,
        provider_key="fcm",
        endpoint_value=ENDPOINT,
        preview_key=KEY,
        preview_session_id=family.id,
    )
    session.flush()
    before = clock.now() - timedelta(seconds=1)
    if family_state == "revoked":
        sessions.revoke(family)
    elif family_state == "inactive":
        family.expires_at = before
    elif family_state == "absolute":
        family.absolute_expires_at = before
    elif family_state == "deleted":
        session.delete(family)
    elif family_state == "access-expired":
        family.access_expires_at = before
    else:
        sessions.refresh_session(session, tokens.refresh_token)
    session.flush()

    provider = FakePushProvider()
    push.providers.register("fcm", provider)

    def deliver_new_creation():
        reminder = create(client, actors)
        event = session.scalar(
            select(OutboxEvent).where(OutboxEvent.subject_id == UUID(reminder["id"]))
        )
        engagement.project_event(session, event)
        session.flush()
        notice = session.scalar(
            select(Notification).where(Notification.source_event_id == event.id)
        )
        delivery = session.scalar(
            select(PushDelivery).where(PushDelivery.notification_id == notice.id)
        )
        push.handle_delivery(session, {"deliveryId": str(delivery.id)})
        return provider.calls[-1]["notificationReference"]

    try:
        valid = family_state in {"access-expired", "rotated"}
        reference = deliver_new_creation()
        assert ("encryptedPreview" in reference) is valid
        assert not {"name", "title", "preview"}.intersection(reference)
        if not valid:
            fresh_family, _ = sessions.start_session(session, actors["b"])
            session.flush()
            rebound = push.register_endpoint(
                session,
                account_id=actors["b"].id,
                provider_key="fcm",
                endpoint_value=ENDPOINT,
                preview_key=KEY,
                preview_session_id=fresh_family.id,
            )
            session.flush()
            assert rebound.id == endpoint.id
            assert session.scalar(select(PushPreviewSecret)).device_session_id == fresh_family.id
            assert "encryptedPreview" in deliver_new_creation()
    finally:
        push.providers.clear()


@pytest.mark.parametrize("family_owner", ["missing", "foreign"])
def test_preview_registration_requires_live_family_of_endpoint_owner(session, actors, family_owner):
    family_id = (
        sessions.resolve(session, actors["token_outsider"])[0].id
        if family_owner == "foreign"
        else None
    )
    with pytest.raises(UnauthenticatedError):
        push.register_endpoint(
            session,
            account_id=actors["b"].id,
            provider_key="fcm",
            endpoint_value=ENDPOINT,
            preview_key=KEY,
            preview_session_id=family_id,
        )
    assert session.scalar(select(PushPreviewSecret)) is None


def test_preview_catalog_rollback_preserves_authored_reminders_and_legacy_registration(
    client, session, actors
):
    reminder = create(client, actors)
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.subject_id == UUID(reminder["id"]))
    )
    engagement.project_event(session, event)
    endpoint = push.register_endpoint(
        session,
        account_id=actors["b"].id,
        provider_key="fcm",
        endpoint_value=ENDPOINT,
        preview_key=KEY,
        preview_session_id=sessions.resolve(session, actors["token_b"])[0].id,
    )
    session.flush()
    path = Path(__file__).parents[2] / "alembic/versions/0099_contextual_reminder_notifications.py"
    spec = importlib.util.spec_from_file_location("preview_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with Operations.context(
        MigrationContext.configure(session.connection(), opts={"target_metadata": Base.metadata})
    ):
        module.downgrade()
        assert not inspect(session.connection()).has_table("push_preview_secrets")
        assert (
            session.scalar(
                select(Reminder.payload).where(Reminder.id == UUID(reminder["id"]))
            ).title
            == reminder["title"]
        )
        assert (
            session.scalar(select(Notification).where(Notification.kind == "REMINDER_CREATED"))
            is None
        )
        from eimir.engagement.models import PushEndpointSecret

        assert (
            session.scalar(
                select(PushEndpointSecret).where(PushEndpointSecret.push_endpoint_id == endpoint.id)
            ).payload.value
            == ENDPOINT
        )
        module.upgrade()
        assert inspect(session.connection()).has_table("push_preview_secrets")
        assert session.scalar(select(PushPreviewSecret)) is None
        assert (
            session.scalar(
                select(Reminder.payload).where(Reminder.id == UUID(reminder["id"]))
            ).title
            == reminder["title"]
        )
