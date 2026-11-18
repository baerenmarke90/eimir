"""Video admission, job ownership and cancellation use the existing DB authority."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import select

from eimir.attachments import cleanup, service, video_jobs, videos
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements.models import EntitlementStatus
from eimir.jobs import queue
from eimir.jobs.models import Job, JobStatus
from tests.conftest import auth, requires_database
from tests.support.video import grant
from tests.support.video import owner as owner

pytestmark = [pytest.mark.integration, requires_database]


def create(client, owner):  # type: ignore[no-untyped-def]
    return client.post(
        f"/api/v1/spaces/{owner[1].id}/attachments",
        json={
            "mediaType": "VIDEO",
            "expectedMimeType": "video/mp4",
            "expectedSize": 10,
            "originalName": "our-video.mp4",
        },
        headers=auth(owner[2]),
    )


def finalize(client, owner):  # type: ignore[no-untyped-def]
    response = create(client, owner)
    assert response.status_code == 201, response.text
    identifier = response.json()["attachment"]["id"]
    path = f"/api/v1/spaces/{owner[1].id}/attachments/{identifier}"
    assert (
        client.put(path + "/content", content=b"0123456789", headers=auth(owner[2])).status_code
        == 204
    )
    response = client.post(path + "/finalize", json={}, headers=auth(owner[2]))
    assert response.status_code == 202, response.text
    return UUID(identifier)


def test_admission_requires_pro_and_operator_availability(client, session, owner, monkeypatch):  # type: ignore[no-untyped-def]
    rejected = create(client, owner)
    assert rejected.status_code == 403
    assert rejected.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    policy_path = f"/api/v1/spaces/{owner[1].id}/attachment-upload-policy"
    assert client.get(policy_path, headers=auth(owner[2])).json()["videoUploadAllowed"] is False
    grant(session, owner)
    session.flush()
    assert client.get(policy_path, headers=auth(owner[2])).json()["videoUploadAllowed"] is True
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "false")
    get_settings.cache_clear()
    assert create(client, owner).status_code == 415


def test_general_worker_cannot_consume_video_jobs(client, session, owner):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)
    job = session.scalars(select(Job).where(Job.kind == service.ATTACHMENT_VIDEO_VALIDATION)).one()
    assert job.payload["attachmentId"] == str(identifier)
    assert not queue.claim(session, "general", excluded_kinds=[service.ATTACHMENT_VIDEO_VALIDATION])
    claimed = queue.claim(session, "video", kinds=[service.ATTACHMENT_VIDEO_VALIDATION])
    assert [item.id for item in claimed] == [job.id]


def test_cancellation_during_decode_wins_before_publication(client, session, owner, monkeypatch):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)

    def cancel(source: Path, directory: Path) -> videos.ProcessedVideo:
        attachment = session.get(Attachment, identifier)
        service.mark_for_deletion(session, attachment)
        session.flush()
        raise videos.VideoRejectedError("VIDEO_INVALID")

    monkeypatch.setattr(videos, "process", cancel)
    video_jobs.validate(session, {"attachmentId": str(identifier)})
    assert session.get(Attachment, identifier).status == AttachmentStatus.DELETING.value


def test_published_video_is_sanitized_and_keeps_nonfatal_missing_poster(
    client, session, owner, monkeypatch
):  # type: ignore[no-untyped-def]
    premium = grant(session, owner)
    identifier = finalize(client, owner)
    # Losing Pro after accepted intake must not strand the admitted upload.
    premium.status = EntitlementStatus.EXPIRED.value
    session.flush()

    def processed(source: Path, directory: Path) -> videos.ProcessedVideo:
        target = directory / "sanitized.mp4"
        target.write_bytes(b"sanitized")
        return videos.ProcessedVideo(target, 9, 96, 64, 1, None)

    monkeypatch.setattr(videos, "process", processed)
    video_jobs.validate(session, {"attachmentId": str(identifier)})
    attachment = session.get(Attachment, identifier)
    session.refresh(attachment)
    assert attachment.status == AttachmentStatus.READY.value
    assert attachment.duration_seconds == 1
    assert attachment.has_thumbnail is False
    assert attachment.payload.original_name == "our-video.mp4"
    assert attachment.payload.preserve_metadata is False


def test_stranded_video_validation_joins_existing_upload_retention(client, session, owner):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)
    attachment = session.get(Attachment, identifier)
    attachment.created_at = now() - timedelta(hours=25)
    attachment.uploaded_at = now() - timedelta(hours=25)
    session.flush()
    cleanup.run_media_cleanup(session, {})
    assert session.get(Attachment, identifier) is None


@pytest.mark.parametrize(
    ("code", "status", "recovered"),
    [
        ("NoReferencedTableError", AttachmentStatus.VALIDATING, True),
        ("VideoRejectedError", AttachmentStatus.VALIDATING, False),
        ("NoReferencedTableError", AttachmentStatus.DELETING, False),
        ("NoReferencedTableError", AttachmentStatus.READY, False),
    ],
)
def test_worker_recovers_only_the_known_live_video_failure(
    client, session, owner, code, status, recovered, monkeypatch
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)
    attachment = session.get(Attachment, identifier)
    attachment.status = status.value
    if status == AttachmentStatus.READY:
        attachment.ready_at = now()
        attachment.mime_type = "video/mp4"
        attachment.size = 10
        attachment.width, attachment.height = 96, 64
        attachment.duration_seconds = 1
    job = session.scalars(select(Job).where(Job.kind == service.ATTACHMENT_VIDEO_VALIDATION)).one()
    job.status = JobStatus.FAILED.value
    job.attempts = job.max_attempts
    job.finished_at = now()
    job.last_error = code
    session.flush()
    assert video_jobs.recover_stranded_validations(session) == int(recovered)
    session.flush()
    if not recovered:
        assert job.status == JobStatus.FAILED.value
        assert attachment.status == status.value
        return
    assert job.status == JobStatus.PENDING.value
    assert job.attempts == 0 and job.finished_at is None and job.last_error is None
    assert video_jobs.recover_stranded_validations(session) == 0

    def processed(source: Path, directory: Path) -> videos.ProcessedVideo:
        target = directory / "sanitized.mp4"
        target.write_bytes(b"sanitized")
        return videos.ProcessedVideo(target, 9, 96, 64, 1, None)

    monkeypatch.setattr(videos, "process", processed)
    video_jobs.validate(session, job.payload)
    session.refresh(attachment)
    assert attachment.status == AttachmentStatus.READY.value
    assert attachment.duration_seconds == 1


def test_recently_uploaded_video_is_not_expired_using_the_old_create_clock(client, session, owner):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)
    attachment = session.get(Attachment, identifier)
    attachment.created_at = now() - timedelta(hours=25)
    session.flush()
    cleanup.run_media_cleanup(session, {})
    assert session.get(Attachment, identifier).status == AttachmentStatus.VALIDATING.value


def bind_memory(client, owner, identifier):  # type: ignore[no-untyped-def]
    base = f"/api/v1/spaces/{owner[1].id}"
    created = client.post(base + "/memories", headers=auth(owner[2]), json={"title": "A saved day"})
    assert created.status_code == 201, created.text
    memory = created.json()
    response = client.put(
        base + f"/memories/{memory['id']}/attachments",
        headers={**auth(owner[2]), "If-Match": str(memory["version"])},
        json={"attachments": [{"attachmentId": str(identifier), "position": 0}]},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_submitted_video_binds_before_validation_and_preserves_later_classification(
    client, session, owner, monkeypatch
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = finalize(client, owner)
    memory = bind_memory(client, owner, identifier)
    assert memory["attachments"][0]["status"] == "PROCESSING"
    base = f"/api/v1/spaces/{owner[1].id}"
    denied = client.post(
        base + f"/attachments/{identifier}/read-access",
        headers=auth(owner[2]),
        json={"parentType": "MEMORY", "parentId": memory["id"]},
    )
    assert denied.status_code in {404, 409}, denied.text

    def processed(source: Path, directory: Path) -> videos.ProcessedVideo:
        changed = client.put(
            base + f"/memories/{memory['id']}/attachments",
            headers={**auth(owner[2]), "If-Match": str(memory["version"])},
            json={
                "attachments": [
                    {"attachmentId": str(identifier), "position": 0, "isSensitive": True}
                ]
            },
        )
        assert changed.status_code == 200, changed.text
        output = directory / "sanitized.mp4"
        output.write_bytes(b"safe")
        return videos.ProcessedVideo(output, 4, 96, 64, 1, None)

    monkeypatch.setattr(videos, "process", processed)
    video_jobs.validate(session, {"attachmentId": str(identifier)})
    session.expire_all()
    current = session.get(Attachment, identifier)
    assert current.status == "READY"
    assert current.payload.is_sensitive is True
    read = client.get(base + f"/memories/{memory['id']}", headers=auth(owner[2])).json()
    assert read["attachments"][0]["status"] == "READY"


@pytest.mark.parametrize("fail_before_binding", [False, True])
def test_video_failure_notifies_only_uploader_once_and_retains_safe_recovery(
    client, session, owner, monkeypatch, fail_before_binding
):  # type: ignore[no-untyped-def]
    from eimir.engagement import service as engagement
    from eimir.engagement.models import Notification
    from eimir.outbox.models import OutboxEvent
    from eimir.relationship import service as relationships
    from tests.conftest import make_account

    partner = make_account(session, "Partner")
    relationships.add_member(session, owner[1].id, partner)
    grant(session, owner)
    identifier = finalize(client, owner)

    def rejected(source: Path, directory: Path) -> videos.ProcessedVideo:
        raise videos.VideoRejectedError("VIDEO_INVALID")

    monkeypatch.setattr(videos, "process", rejected)
    if fail_before_binding:
        video_jobs.validate(session, {"attachmentId": str(identifier)})
    memory = bind_memory(client, owner, identifier)
    if not fail_before_binding:
        video_jobs.validate(session, {"attachmentId": str(identifier)})
    video_jobs.validate(session, {"attachmentId": str(identifier)})
    events = list(
        session.scalars(
            select(OutboxEvent).where(OutboxEvent.event_type == "VIDEO_PROCESSING_FAILED")
        )
    )
    assert len(events) == 1
    engagement.project_event(session, events[0])
    engagement.project_event(session, events[0])
    notifications = list(
        session.scalars(select(Notification).where(Notification.kind == "VIDEO_PROCESSING_FAILED"))
    )
    assert len(notifications) == 1
    assert notifications[0].recipient_account_id == owner[0].id
    assert str(notifications[0].target_id) == memory["id"]
    assert notifications[0].target_type == "MEMORY"
    attachment = session.get(Attachment, identifier)
    attachment.failed_at = now() - timedelta(hours=25)
    session.flush()
    cleanup._expire_stale_uploads(session)
    session.flush()
    assert attachment.status == "FAILED"
    assert attachment.failed_media_purged_at is not None
    retained = client.get(
        f"/api/v1/spaces/{owner[1].id}/memories/{memory['id']}", headers=auth(owner[2])
    ).json()
    assert retained["attachments"][0]["status"] == "FAILED"
    assert retained["attachments"][0]["failureCode"] == "VIDEO_INVALID"

    center = f"/api/v1/spaces/{owner[1].id}/notifications"
    listed = client.get(center, headers=auth(owner[2]))
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()["items"]] == [str(notifications[0].id)]
    opened = client.post(center + f"/{notifications[0].id}/open", headers=auth(owner[2]))
    assert opened.status_code == 200, opened.text
    assert opened.json()["target"]["targetId"] == memory["id"]
    removed = client.put(
        f"/api/v1/spaces/{owner[1].id}/memories/{memory['id']}/attachments",
        headers={**auth(owner[2]), "If-Match": str(retained["version"])},
        json={"attachments": []},
    )
    assert removed.status_code == 200, removed.text
    assert client.get(center, headers=auth(owner[2])).json()["items"] == []
    assert (
        client.post(center + f"/{notifications[0].id}/open", headers=auth(owner[2])).status_code
        == 404
    )


def test_pending_images_still_cannot_bind_but_video_reservations_keep_a_placeholder(
    client, session, owner
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    video = create(client, owner).json()["attachment"]["id"]
    base = f"/api/v1/spaces/{owner[1].id}"
    memory = client.post(base + "/memories", headers=auth(owner[2]), json={"title": "Day"}).json()
    image = client.post(
        base + "/attachments",
        headers=auth(owner[2]),
        json={
            "mediaType": "IMAGE",
            "expectedMimeType": "image/jpeg",
            "expectedSize": 10,
            "originalName": "photo.jpg",
        },
    ).json()["attachment"]["id"]
    client.put(
        base + f"/attachments/{image}/content", content=b"0123456789", headers=auth(owner[2])
    )
    client.post(base + f"/attachments/{image}/finalize", json={}, headers=auth(owner[2]))
    for identifier, expected_status in ((image, 409), (video, 200)):
        result = client.put(
            base + f"/memories/{memory['id']}/attachments",
            headers={**auth(owner[2]), "If-Match": str(memory["version"])},
            json={"attachments": [{"attachmentId": identifier, "position": 0}]},
        )
        assert result.status_code == expected_status, result.text
    assert result.json()["attachments"][0]["status"] == "PENDING"


@pytest.mark.parametrize("legacy", [False, True])
@pytest.mark.parametrize("visibility", ["SHARED", "PRIVATE"])
def test_heart_moment_accepts_submitted_video_without_exposing_unvalidated_media(
    client, session, owner, monkeypatch, legacy, visibility
):  # type: ignore[no-untyped-def]
    from eimir.engagement import service as engagement
    from eimir.engagement.models import Notification
    from eimir.outbox.models import OutboxEvent

    grant(session, owner)
    identifier = finalize(client, owner)
    base = f"/api/v1/spaces/{owner[1].id}"
    response = client.post(
        base + "/heart-moments",
        headers=auth(owner[2]),
        json={
            "text": "A moving moment",
            "happenedOn": "2026-10-01",
            "emotion": "HAPPY",
            "visibility": visibility,
            **(
                {"attachmentId": str(identifier)}
                if legacy
                else {"attachments": [{"attachmentId": str(identifier), "position": 0}]}
            ),
        },
    )
    assert response.status_code == 201, response.text
    moment = response.json()
    assert moment["attachments"][0]["status"] == "PROCESSING"
    assert moment["attachment"]["status"] == "PROCESSING"
    assert moment["attachment"]["hasThumbnail"] is False

    def rejected(source: Path, directory: Path) -> videos.ProcessedVideo:
        raise videos.VideoRejectedError("VIDEO_INVALID")

    monkeypatch.setattr(videos, "process", rejected)
    video_jobs.validate(session, {"attachmentId": str(identifier)})
    event = session.scalar(
        select(OutboxEvent).where(OutboxEvent.event_type == "VIDEO_PROCESSING_FAILED")
    )
    engagement.project_event(session, event)
    session.flush()
    notification = session.scalar(
        select(Notification).where(Notification.kind == "VIDEO_PROCESSING_FAILED")
    )
    assert notification.recipient_account_id == owner[0].id
    assert notification.target_type == "HEART_MOMENT"
    assert str(notification.target_id) == moment["id"]

    from eimir.relationship import service as relationships
    from tests.conftest import make_account, sign_in

    partner = make_account(session, "Partner")
    relationships.add_member(session, owner[1].id, partner)
    partner_token = sign_in(session, partner)
    center = base + "/notifications"
    listed = client.get(center, headers=auth(owner[2]))
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()["items"]] == [str(notification.id)]
    assert client.get(center, headers=auth(partner_token)).json()["items"] == []
    target = center + f"/{notification.id}/open"
    assert client.post(target, headers=auth(partner_token)).status_code == 404
    opened = client.post(target, headers=auth(owner[2]))
    assert opened.status_code == 200, opened.text
    assert opened.json()["target"]["targetId"] == moment["id"]
    removed = client.patch(
        base + f"/heart-moments/{moment['id']}",
        headers={**auth(owner[2]), "If-Match": str(moment["version"])},
        json={"attachments": []},
    )
    assert removed.status_code == 200, removed.text
    assert client.get(center, headers=auth(owner[2])).json()["items"] == []
    assert client.get(center + "/unread-count", headers=auth(owner[2])).json()["unreadCount"] == 0
    assert client.post(target, headers=auth(owner[2])).status_code == 404


@pytest.mark.parametrize("parent", ["memories", "heart-moments"])
def test_parent_is_saved_before_video_bytes_and_the_same_reservation_finishes(
    client, session, owner, parent
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = create(client, owner).json()["attachment"]["id"]
    base = f"/api/v1/spaces/{owner[1].id}"
    body = (
        {"title": "Our day"}
        if parent == "memories"
        else {
            "text": "A moving moment",
            "happenedOn": "2026-10-01",
            "emotion": "HAPPY",
            "visibility": "PRIVATE",
        }
    )
    response = client.post(
        base + "/" + parent,
        headers=auth(owner[2]),
        json={
            **body,
            "attachments": [{"attachmentId": identifier, "position": 0, "isSensitive": True}],
        },
    )
    assert response.status_code == 201, response.text
    saved = response.json()
    assert saved["attachments"][0]["status"] == "PENDING"
    assert saved["attachments"][0]["hasThumbnail"] is False
    assert saved["attachments"][0]["isSensitive"] is True
    access = client.post(
        base + f"/attachments/{identifier}/read-access",
        headers=auth(owner[2]),
        json={
            "parentType": "MEMORY" if parent == "memories" else "HEART_MOMENT",
            "parentId": saved["id"],
        },
    )
    assert access.status_code in {404, 409}
    assert (
        client.put(
            base + f"/attachments/{identifier}/content",
            content=b"0123456789",
            headers=auth(owner[2]),
        ).status_code
        == 204
    )
    assert (
        client.post(
            base + f"/attachments/{identifier}/finalize", json={}, headers=auth(owner[2])
        ).status_code
        == 202
    )
    current = client.get(base + "/" + parent + "/" + saved["id"], headers=auth(owner[2])).json()
    assert current["attachments"][0]["id"] == identifier
    assert current["attachments"][0]["status"] == "PROCESSING"
    assert current["attachments"][0]["isSensitive"] is True


def test_atomic_memory_gallery_replay_checks_identity_and_rolls_back_invalid_binding(
    production_client, monkeypatch, request
):  # type: ignore[no-untyped-def]
    from uuid import uuid4

    from eimir.memories.models import Memory
    from eimir.outbox.models import OutboxEvent
    from tests.conftest import make_account, make_space, sign_in

    # Rollback assertions require the real request unit of work, not the shared
    # uncommitted-session client used by ordinary lifecycle tests.
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    request.addfinalizer(get_settings.cache_clear)
    client, maker = production_client
    with maker.begin() as session:
        account = make_account(session, "Video author")
        space = make_space(session, account)
        owner = account, space, sign_in(session, account)
        grant(session, owner)
    identifier = create(client, owner).json()["attachment"]["id"]
    base = f"/api/v1/spaces/{owner[1].id}/memories"
    body = {"title": "Our day", "attachments": [{"attachmentId": identifier, "position": 0}]}
    headers = {**auth(owner[2]), "Idempotency-Key": str(uuid4())}
    first = client.post(base, headers=headers, json=body)
    assert first.status_code == 201, first.text
    replay = client.post(base, headers=headers, json=body)
    assert replay.status_code == 200, replay.text
    assert replay.json()["id"] == first.json()["id"]
    assert len(replay.json()["attachments"]) == 1
    changed = {
        **body,
        "attachments": [{"attachmentId": identifier, "position": 0, "isSensitive": True}],
    }
    assert client.post(base, headers=headers, json=changed).status_code == 409
    # Already-bound and missing media reject the whole parent transaction.
    assert client.post(base, headers=auth(owner[2]), json=body).status_code == 409
    missing = {**body, "attachments": [{"attachmentId": str(uuid4()), "position": 0}]}
    assert client.post(base, headers=auth(owner[2]), json=missing).status_code == 404
    with maker() as session:
        assert len(list(session.scalars(select(Memory).where(Memory.space_id == owner[1].id)))) == 1
        events = list(
            session.scalars(
                select(OutboxEvent).where(
                    OutboxEvent.event_type.in_(["MEMORY_CREATED", "MEMORY_UPDATED"])
                )
            )
        )
        assert [event.event_type for event in events] == ["MEMORY_CREATED"]


@pytest.mark.parametrize("uploaded", [False, True])
def test_abandoned_bound_video_keeps_an_editable_failed_placeholder(
    client, session, owner, uploaded
):  # type: ignore[no-untyped-def]
    grant(session, owner)
    identifier = UUID(create(client, owner).json()["attachment"]["id"])
    memory = bind_memory(client, owner, identifier)
    base = f"/api/v1/spaces/{owner[1].id}"
    if uploaded:
        assert (
            client.put(
                base + f"/attachments/{identifier}/content",
                content=b"0123456789",
                headers=auth(owner[2]),
            ).status_code
            == 204
        )
    attachment = session.get(Attachment, identifier)
    attachment.created_at = now() - timedelta(hours=25)
    if uploaded:
        attachment.uploaded_at = attachment.created_at
    session.flush()
    cleanup._expire_stale_uploads(session)
    session.flush()
    assert attachment.status == "FAILED"
    assert attachment.failure_code == "VIDEO_UPLOAD_TIMEOUT"
    assert attachment.failed_media_purged_at is not None
    retained = client.get(base + f"/memories/{memory['id']}", headers=auth(owner[2])).json()
    assert retained["attachments"][0]["status"] == "FAILED"
    edited = client.put(
        base + f"/memories/{memory['id']}/attachments",
        headers={**auth(owner[2]), "If-Match": str(retained["version"])},
        json={
            "attachments": [{"attachmentId": str(identifier), "position": 0, "isSensitive": True}]
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["attachments"][0]["isSensitive"] is True
