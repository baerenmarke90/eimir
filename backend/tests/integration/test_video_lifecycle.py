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
