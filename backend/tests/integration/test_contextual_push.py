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
from eimir.comments.models import Comment, CommentPayload
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
from tests.integration.test_shared_experiences import grant, path
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
        assert session.scalar(select(PushPreviewSecret.id)) is None
        assert (
            session.scalar(
                select(Reminder.payload).where(Reminder.id == UUID(reminder["id"]))
            ).title
            == reminder["title"]
        )


def _register_content_preview(session, actors, provider):
    push.providers.register("fcm", provider)
    push.register_endpoint(
        session,
        account_id=actors["b"].id,
        provider_key="fcm",
        endpoint_value=ENDPOINT,
        preview_key=KEY,
        preview_session_id=sessions.resolve(session, actors["token_b"])[0].id,
        preview_version=2,
    )
    session.flush()


def _deliver_content(session, source_id, provider):
    event = session.scalar(select(OutboxEvent).where(OutboxEvent.subject_id == UUID(source_id)))
    engagement.project_event(session, event)
    session.flush()
    notice = session.scalar(select(Notification).where(Notification.source_event_id == event.id))
    delivery = session.scalar(select(PushDelivery).where(PushDelivery.notification_id == notice.id))
    push.handle_delivery(session, {"deliveryId": str(delivery.id)})
    reference = provider.calls[-1]["notificationReference"]
    decoded = jwe.decrypt_compact(
        reference["encryptedPreview"],
        OctKey.import_key({"kty": "oct", "k": KEY}),
        algorithms=["dir", "A256GCM"],
    )
    return notice, json.loads(decoded.plaintext), event


@pytest.mark.parametrize(
    ("segment", "fields", "expected_title"),
    [
        ("memories", {"title": "Our walk", "body": "Not the comment"}, "Our walk"),
        ("milestones", {"title": "Our milestone", "happenedOn": "2026-01-01"}, "Our milestone"),
        ("plans", {"title": "Our plan"}, "Our plan"),
        (
            "heart-moments",
            {
                "text": "Sensitive parent text",
                "emotion": "LOVED",
                "visibility": "SHARED",
                "happenedOn": "2026-01-01",
            },
            "",
        ),
    ],
)
def test_comments_encrypt_the_exact_current_authored_text_for_every_supported_parent(
    client, session, actors, encryption, segment, fields, expected_title
):
    encryption.apply("required")
    provider = FakePushProvider()
    try:
        _register_content_preview(session, actors, provider)
        parent = client.post(path(actors, segment), headers=auth(actors["token_a"]), json=fields)
        assert parent.status_code == 201, parent.text
        response = client.post(
            path(actors, f"{segment}/{parent.json()['id']}/comments"),
            headers=auth(actors["token_a"]),
            json={"body": "The actual partner comment 💛"},
        )
        assert response.status_code == 201, response.text
        comment_id = response.json()["id"]
        notice, preview, event = _deliver_content(session, comment_id, provider)
        assert preview["v"] == 2
        assert preview["kind"] == "COMMENT_CREATED"
        assert preview["title"] == expected_title
        assert preview["body"] == "The actual partner comment 💛"
        assert preview["name"] == actors["a"].display_name
        assert preview["body"] not in event.payload.model_dump_json()
        assert "body" not in provider.calls[-1]["notificationReference"]
        comment = session.get(Comment, UUID(comment_id))
        comment.payload = CommentPayload(body="Current edited words")
        session.flush()
        assert (
            json.loads(push_preview.for_notification(session, notice, digest=False, version=2))[
                "body"
            ]
            == "Current edited words"
        )
        digest = json.loads(push_preview.for_notification(session, notice, digest=True, version=2))
        assert digest["body"] == "" and digest["digest"] is True
        legacy = json.loads(push_preview.for_notification(session, notice, digest=False))
        assert legacy["v"] == 1 and "body" not in legacy
        session.delete(comment)
        session.flush()
        assert (
            json.loads(push_preview.for_notification(session, notice, digest=False, version=2))[
                "body"
            ]
            == ""
        )
    finally:
        push.providers.clear()


@pytest.mark.parametrize("kind", ["HAPPINESS", "TIME_TRAVEL"])
def test_shared_answers_encrypt_question_and_actual_answer_and_recheck_source_deletion(
    client, session, actors, encryption, kind
):
    encryption.apply("required")
    grant(session, actors["space"].id, actors["a"].id)
    provider = FakePushProvider()
    try:
        _register_content_preview(session, actors, provider)
        response = client.post(
            path(actors),
            headers=auth(actors["token_a"]),
            json={
                "title": "The original question?",
                "body": "The actual shared answer 💛",
                "experienceKind": kind,
            },
        )
        assert response.status_code == 201, response.text
        memory = response.json()
        notice, preview, event = _deliver_content(session, memory["id"], provider)
        assert preview["v"] == 2 and preview["title"] == "The original question?"
        assert preview["body"] == "The actual shared answer 💛"
        assert preview["body"] not in event.payload.model_dump_json()
        removed = client.delete(
            path(actors, f"memories/{memory['id']}"),
            headers={**auth(actors["token_a"]), "If-Match": f'"{memory["version"]}"'},
        )
        assert removed.status_code == 204
        assert push_preview.for_notification(session, notice, digest=False, version=2) is None
    finally:
        push.providers.clear()


@pytest.mark.parametrize("mismatch", ["source", "actor", "space", "parent", "private-parent"])
def test_comment_preview_cannot_copy_deleted_foreign_or_unrelated_content(
    client, session, actors, mismatch
):
    parent = client.post(
        path(actors, "heart-moments"),
        headers=auth(actors["token_a"]),
        json={
            "text": "Parent words stay separate",
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": "2026-01-01",
        },
    ).json()
    comment = client.post(
        path(actors, f"heart-moments/{parent['id']}/comments"),
        headers=auth(actors["token_a"]),
        json={"body": "Never copy unrelated words"},
    ).json()
    event = session.scalar(select(OutboxEvent).where(OutboxEvent.subject_id == UUID(comment["id"])))
    engagement.project_event(session, event)
    session.flush()
    notice = session.scalar(select(Notification).where(Notification.source_event_id == event.id))
    if mismatch == "source":
        notice.source_event_id = session.scalar(
            select(OutboxEvent.id).where(OutboxEvent.subject_id == UUID(parent["id"]))
        )
    elif mismatch == "actor":
        notice.actor_id = actors["b"].id
    elif mismatch == "space":
        session.get(Comment, UUID(comment["id"])).space_id = actors["foreign"].id
    elif mismatch == "parent":
        session.get(Comment, UUID(comment["id"])).target_id = UUID(int=123)
    else:
        response = client.patch(
            path(actors, f"heart-moments/{parent['id']}/visibility"),
            headers={**auth(actors["token_a"]), "If-Match": f'"{parent["version"]}"'},
            json={"visibility": "PRIVATE"},
        )
        assert response.status_code == 200, response.text
    session.flush()
    result = push_preview.for_notification(session, notice, digest=False, version=2)
    assert result is None or json.loads(result)["body"] == ""
    assert result is None or "Never copy unrelated words" not in result


def test_preview_protocol_migration_preserves_keys_and_safely_falls_back_to_v1(session, actors):
    provider = FakePushProvider()
    try:
        _register_content_preview(session, actors, provider)
        secret = session.scalar(select(PushPreviewSecret))
        assert secret.preview_version == 2
        stored = session.scalar(text("SELECT payload::text FROM push_preview_secrets"))
        migration_path = (
            Path(__file__).parents[2] / "alembic/versions/0109_push_content_previews.py"
        )
        spec = importlib.util.spec_from_file_location("content_preview_migration", migration_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with Operations.context(
            MigrationContext.configure(
                session.connection(), opts={"target_metadata": Base.metadata}
            )
        ):
            module.downgrade()
            assert session.scalar(text("SELECT payload::text FROM push_preview_secrets")) == stored
            module.upgrade()
        session.refresh(secret)
        assert secret.preview_version == 1
        assert secret.payload.model_dump() == {"key": KEY}
    finally:
        push.providers.clear()
