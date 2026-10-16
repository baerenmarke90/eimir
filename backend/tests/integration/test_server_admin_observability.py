"""Privacy boundaries and filters for #551 ServerAdmin observability."""

from __future__ import annotations

from datetime import timedelta

import pytest

from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity.models import AccountEmail
from eimir.jobs.models import Job, JobStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
ADMIN_EMAIL = "observability-operator@example.test"


@pytest.fixture
def server_admin_allowlist(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_SERVER_ADMIN_EMAILS", f'["{ADMIN_EMAIL}"]')
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _admin(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Observability operator")
    session.add(
        AccountEmail(
            account_id=account.id,
            email=ADMIN_EMAIL,
            is_primary=True,
            verified_at=now(),
        )
    )
    session.flush()
    return account, sign_in(session, account)


def _attachment(
    session,
    account,
    space,
    *,
    status: AttachmentStatus,
    media_type: MediaType,
    declared_size: int,
    size: int | None,
    ready_at=None,  # type: ignore[no-untyped-def]
    has_thumbnail: bool = False,
    original_name: str,
):  # type: ignore[no-untyped-def]
    attachment = Attachment(
        space_id=space.id,
        owner_id=account.id,
        privacy_class="OWNER_ONLY",
        status=status.value,
        media_type=media_type.value,
        declared_mime_type=("image/jpeg" if media_type is MediaType.IMAGE else "video/mp4"),
        declared_size=declared_size,
        mime_type=("image/jpeg" if media_type is MediaType.IMAGE else "video/mp4"),
        size=size,
        has_thumbnail=has_thumbnail,
        ready_at=ready_at,
        payload=AttachmentPayload(original_name=original_name),
    )
    session.add(attachment)
    session.flush()
    return attachment


def test_jobs_and_storage_require_server_admin(
    client,
    session,
) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Ordinary")
    token = sign_in(session, account)

    assert client.get("/api/v1/server-admin/jobs").status_code == 401
    assert client.get("/api/v1/server-admin/storage").status_code == 401
    assert client.get("/api/v1/server-admin/jobs", headers=auth(token)).status_code == 403
    assert client.get("/api/v1/server-admin/storage", headers=auth(token)).status_code == 403


def test_job_directory_is_filterable_paginated_and_payload_safe(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    _, token = _admin(session)
    current = now()
    secret_payload = "owner-only-job-payload"
    secret_error = "https://secret-token@private.invalid/error"
    secret_worker = "worker-private-hostname"

    jobs = [
        Job(
            kind="media.validate",
            payload={"secret": secret_payload},
            status=JobStatus.FAILED.value,
            attempts=5,
            max_attempts=5,
            created_at=current - timedelta(hours=2),
            run_after=current - timedelta(hours=2),
            finished_at=current - timedelta(hours=1),
            last_error=secret_error,
            locked_by=secret_worker,
        ),
        Job(
            kind="media.validate",
            payload={"secret": "another-secret"},
            status=JobStatus.FAILED.value,
            attempts=1,
            max_attempts=5,
            created_at=current - timedelta(days=40),
            run_after=current - timedelta(days=40),
            finished_at=current - timedelta(days=39),
        ),
        Job(
            kind="mail.send",
            payload={"body": "private mail body"},
            status=JobStatus.PENDING.value,
            attempts=0,
            max_attempts=5,
            created_at=current - timedelta(hours=3),
            run_after=current - timedelta(minutes=10),
        ),
    ]
    session.add_all(jobs)
    session.flush()

    exhausted = client.get(
        "/api/v1/server-admin/jobs?status=FAILED&kind=media.validate&exhausted=true&createdWithin=24h",
        headers=auth(token),
    )

    assert exhausted.status_code == 200
    payload = exhausted.json()
    assert payload["total"] == 1
    assert payload["limit"] == 50
    assert payload["offset"] == 0
    item = payload["items"][0]
    assert item["kind"] == "media.validate"
    assert item["status"] == "FAILED"
    assert item["attempts"] == 5
    assert item["maxAttempts"] == 5
    assert item["exhausted"] is True
    assert item["delayed"] is False
    assert item["pendingAgeSeconds"] is None
    assert set(item) == {
        "id",
        "kind",
        "status",
        "attempts",
        "maxAttempts",
        "createdAt",
        "runAfter",
        "finishedAt",
        "exhausted",
        "delayed",
        "pendingAgeSeconds",
    }
    for forbidden in (
        secret_payload,
        secret_error,
        secret_worker,
        "lastError",
        "lockedBy",
        "payload",
    ):
        assert forbidden not in exhausted.text

    pending = client.get(
        "/api/v1/server-admin/jobs?status=PENDING&limit=1&offset=0",
        headers=auth(token),
    )
    assert pending.status_code == 200
    assert pending.json()["total"] == 1
    assert len(pending.json()["items"]) == 1
    assert pending.json()["items"][0]["delayed"] is True
    assert pending.json()["items"][0]["pendingAgeSeconds"] >= 0


def test_storage_projection_uses_server_size_and_never_private_attachment_metadata(
    client,
    session,
    server_admin_allowlist,
) -> None:  # type: ignore[no-untyped-def]
    account, token = _admin(session)
    space = make_space(session, account)
    current = now()
    private_name = "private-holiday-photo-name.jpg"

    _attachment(
        session,
        account,
        space,
        status=AttachmentStatus.READY,
        media_type=MediaType.IMAGE,
        declared_size=999_999_999,
        size=120,
        ready_at=current - timedelta(hours=2),
        has_thumbnail=True,
        original_name=private_name,
    )
    _attachment(
        session,
        account,
        space,
        status=AttachmentStatus.READY,
        media_type=MediaType.IMAGE,
        declared_size=777_777_777,
        size=None,
        ready_at=current - timedelta(days=10),
        original_name="another-private-name.jpg",
    )
    _attachment(
        session,
        account,
        space,
        status=AttachmentStatus.FAILED,
        media_type=MediaType.VIDEO,
        declared_size=888_888_888,
        size=500,
        original_name="private-video.mp4",
    )
    _attachment(
        session,
        account,
        space,
        status=AttachmentStatus.UPLOADING,
        media_type=MediaType.IMAGE,
        declared_size=666_666_666,
        size=None,
        original_name="uploading-private.jpg",
    )

    response = client.get("/api/v1/server-admin/storage", headers=auth(token))

    assert response.status_code == 200
    payload = response.json()
    status_counts = {item["status"]: item["count"] for item in payload["statusCounts"]}
    media_counts = {item["mediaType"]: item["count"] for item in payload["mediaTypeCounts"]}
    growth = {item["window"]: item for item in payload["growth"]}

    assert payload["readyCount"] == 2
    assert payload["readyBytes"] == 120
    assert payload["readySizeUnknownCount"] == 1
    assert payload["thumbnailReadyCount"] == 1
    assert payload["failedCount"] == 1
    assert payload["uploadingCount"] == 1
    assert status_counts["READY"] == 2
    assert status_counts["FAILED"] == 1
    assert status_counts["UPLOADING"] == 1
    assert media_counts["IMAGE"] == 3
    assert media_counts["VIDEO"] == 1
    assert growth["24h"]["readyCount"] == 1
    assert growth["24h"]["readyBytes"] == 120
    assert growth["7d"]["readyCount"] == 1
    assert growth["30d"]["readyCount"] == 2
    assert growth["30d"]["readySizeUnknownCount"] == 1

    serialized = response.text
    for forbidden in (
        private_name,
        "originalName",
        "declaredSize",
        "mimeType",
        "ownerId",
        "spaceId",
        "storageKey",
        "preview",
        "payload",
    ):
        assert forbidden not in serialized
    assert "999999999" not in serialized
    assert "777777777" not in serialized
