"""A Transfer import must fit the Space's Cloud storage quota (#2141).

What an import adds counts at its size: only the media it would actually add,
so a repeated import of the same file needs nothing. When it does not fit, the
whole bundle is refused with `413` and nothing changes; the import stays ready
to apply. When leaving the videos out would fit, the refusal and the preview
say so. Recovering skipped videos counts the same way. Self-Hosted is
unmetered. These are Core tests and run in both plugin configurations; where
the video capability is needed it is granted by replacing `videos_allowed`,
because the real processor is plugin code.
"""

from __future__ import annotations

import io
from collections.abc import Callable
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments import quota
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus
from eimir.attachments.quota import StorageQuotaExceededError
from eimir.authorization import AuthorizationContext
from eimir.config import Deployment, get_settings
from eimir.core.clock import now
from eimir.memories.models import Memory
from eimir.relationship import service as relationship_service
from eimir.transfer import service as transfers
from eimir.transfer.models import ImportStatus, TransferImport, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_transfer_video_gate import (
    _forge_videos,
    _image,
    _memory,
    _run_apply_job,
)
from tests.integration.test_transfer_video_recovery import _apply, _stage, skipped

pytestmark = [pytest.mark.integration, requires_database]

__all__ = ["skipped"]  # a fixture reused from the recovery tests


@pytest.fixture
def cloud_quota(monkeypatch: pytest.MonkeyPatch) -> Callable[[int | None], None]:
    """Run as Cloud with this Free quota, until the test ends."""

    def configure(free: int | None) -> None:
        settings = get_settings().model_copy(
            update={
                "deployment": Deployment.CLOUD,
                "storage_quota_free_bytes": free,
                "storage_quota_premium_bytes": None,
            }
        )
        monkeypatch.setattr(quota, "get_settings", lambda: settings)

    return configure


@pytest.fixture
def staged(client, session: Session):  # type: ignore[no-untyped-def]
    """A fresh target Space with a validated import of photos and two videos."""
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    token = sign_in(session, anna)
    first, clip, last, lonely_clip = (_image(client, source.id, token, session) for _ in range(4))
    gallery = _memory(client, source.id, token, "A day at the lake", [first, clip, last])
    _memory(client, source.id, token, "Only a clip", [lonely_clip])
    context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    with transfers.build_export_archive(session, context, TransferScope.SHARED) as bundle:
        data = _forge_videos(bundle, {clip, lonely_clip}, gallery, clip, ben.id, last).getvalue()
    target = make_space(session, anna)
    relationship_service.add_member(session, target.id, ben)
    target_context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    transfer = _stage(session, target_context, data)
    summary = transfer.summary or {}
    return {
        "anna": anna,
        "target": target,
        "context": target_context,
        "token": token,
        "data": data,
        "transfer": transfer,
        "needed": int(summary["storageNeeded"]),
        "without_videos": int(summary["storageNeededWithoutVideos"]),
    }


def _preview(client, staged) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    path = f"/api/v1/spaces/{staged['target'].id}/transfer/imports/{staged['transfer'].id}"
    detail = client.get(path, headers=auth(staged["token"]))
    assert detail.status_code == 200, detail.text
    return dict(detail.json()["summary"])


def _usage(session: Session, space_id: UUID) -> int:
    return quota.space_usage(session, space_id)


def _memory_count(session: Session, space_id: UUID) -> int:
    return int(
        session.scalar(select(func.count(Memory.id)).where(Memory.space_id == space_id)) or 0
    )


def _occupy(session: Session, staged, size: int) -> Attachment:  # type: ignore[no-untyped-def]
    """Another finished photo of the Space that takes ``size`` bytes."""
    photo = Attachment(
        space_id=staged["target"].id,
        owner_id=staged["anna"].id,
        privacy_class="OWNER_ONLY",
        status=AttachmentStatus.READY.value,
        media_type="IMAGE",
        declared_mime_type="image/jpeg",
        declared_size=size,
        mime_type="image/jpeg",
        size=size,
        ready_at=now(),
        payload=AttachmentPayload(original_name="photo.jpg"),
    )
    session.add(photo)
    session.flush()
    return photo


def test_the_preview_counts_only_the_media_the_import_adds(client, session, staged) -> None:  # type: ignore[no-untyped-def]
    media = sum(
        int(item["size"])
        for item in transfers.validate_import_bundle(
            session,
            staged["context"],
            io.BytesIO(staged["data"]),
            compressed_size=len(staged["data"]),
        ).media
    )
    summary = _preview(client, staged)

    assert summary["storageNeeded"] == media
    assert 0 < summary["storageNeededWithoutVideos"] < summary["storageNeeded"]
    # Self-Hosted is unmetered.
    assert summary["storageAvailable"] is None
    assert summary["storageQuotaExceeded"] is False
    assert summary["storageFitsWithoutVideos"] is True


def test_self_hosted_ignores_the_quota_settings(client, session, staged, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    settings = get_settings().model_copy(update={"storage_quota_free_bytes": 1})
    monkeypatch.setattr(quota, "get_settings", lambda: settings)
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)

    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "ALL")

    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])
    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code


def test_an_import_that_hits_the_quota_exactly_fits(
    client, session, staged, cloud_quota, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    cloud_quota(staged["needed"])
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    summary = _preview(client, staged)
    assert summary["storageAvailable"] == staged["needed"]
    assert summary["storageQuotaExceeded"] is False

    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "ALL")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])

    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code
    # The imported videos wait for validation and reserve their size.
    assert _usage(session, staged["target"].id) == staged["needed"]


def test_one_byte_over_refuses_the_bundle_and_offers_leaving_the_videos_out(
    client, session, staged, cloud_quota, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    cloud_quota(staged["needed"] - 1)
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    summary = _preview(client, staged)
    assert summary["storageQuotaExceeded"] is True
    assert summary["storageFitsWithoutVideos"] is True

    refused, _ = _apply(client, session, staged["transfer"], staged["token"], "ALL")

    assert refused.status_code == 413, refused.text
    assert refused.json()["code"] == "STORAGE_QUOTA_EXCEEDED_FITS_WITHOUT_VIDEOS"
    session.refresh(staged["transfer"])
    assert staged["transfer"].status == ImportStatus.READY_TO_APPLY
    assert staged["transfer"].apply_job_id is None
    assert _memory_count(session, staged["target"].id) == 0

    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])
    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code
    assert _usage(session, staged["target"].id) == staged["without_videos"]


def test_a_bundle_that_does_not_fit_even_without_videos_is_refused(
    client, session, staged, cloud_quota, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    cloud_quota(staged["without_videos"] - 1)
    summary = _preview(client, staged)
    assert summary["storageQuotaExceeded"] is True
    assert summary["storageFitsWithoutVideos"] is False

    without, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")
    assert without.status_code == 413, without.text
    assert without.json()["code"] == "STORAGE_QUOTA_EXCEEDED"

    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    everything, _ = _apply(client, session, staged["transfer"], staged["token"], "ALL")
    assert everything.status_code == 413, everything.text
    assert everything.json()["code"] == "STORAGE_QUOTA_EXCEEDED"
    assert _memory_count(session, staged["target"].id) == 0


def test_a_space_over_its_quota_after_a_downgrade_cannot_import_but_keeps_everything(
    client, session, staged, cloud_quota
) -> None:  # type: ignore[no-untyped-def]
    existing = _occupy(session, staged, 5_000)
    cloud_quota(1_000)
    assert _preview(client, staged)["storageAvailable"] == 0

    refused, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")

    assert refused.status_code == 413, refused.text
    session.refresh(existing)
    assert existing.status == AttachmentStatus.READY.value


def test_room_taken_before_the_job_runs_keeps_the_import_ready(
    client, session, staged, cloud_quota
) -> None:  # type: ignore[no-untyped-def]
    cloud_quota(staged["without_videos"])
    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")
    assert accepted.status_code == 202, accepted.text
    # Another upload takes the room between the confirmation and the job.
    other = _occupy(session, staged, 1)

    _run_apply_job(session, staged["transfer"])

    assert staged["transfer"].status == ImportStatus.READY_TO_APPLY
    assert staged["transfer"].error_code == "STORAGE_QUOTA_EXCEEDED"
    assert _memory_count(session, staged["target"].id) == 0
    assert _usage(session, staged["target"].id) == 1

    # Freeing the room lets the same file be applied again, without a new upload.
    session.delete(other)
    session.flush()
    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])
    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code
    assert staged["transfer"].error_code is None


def test_a_repeated_import_needs_no_room_for_what_the_space_has(
    client, session, staged, cloud_quota
) -> None:  # type: ignore[no-untyped-def]
    accepted, _ = _apply(client, session, staged["transfer"], staged["token"], "WITHOUT_VIDEOS")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])
    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code
    # The Space is now exactly full.
    cloud_quota(_usage(session, staged["target"].id))

    again = _stage(session, staged["context"], staged["data"])
    summary = (again.summary or {})["storageNeededWithoutVideos"]
    assert summary == 0

    repeated, _ = _apply(client, session, again, staged["token"], "WITHOUT_VIDEOS")
    assert repeated.status_code == 202, repeated.text
    _run_apply_job(session, again)
    assert again.status == ImportStatus.COMPLETED, again.error_code


def test_recovering_videos_that_do_not_fit_is_refused(
    client, session, skipped, cloud_quota, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    cloud_quota(quota.space_usage(session, skipped["target"].id))
    again = _stage(session, skipped["context"], skipped["data"])
    path = f"/api/v1/spaces/{skipped['target'].id}/transfer/imports/{again.id}"
    summary = client.get(path, headers=auth(skipped["token"])).json()["summary"]
    assert summary["recoverableVideoCount"] == 2
    assert summary["recoverableVideoBytes"] > 0
    assert summary["storageAvailable"] == 0

    refused, _ = _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")

    assert refused.status_code == 413, refused.text
    assert refused.json()["code"] == "STORAGE_QUOTA_EXCEEDED"
    assert (
        len(
            transfers.recoverable_videos(
                session, skipped["target"].id, skipped["anna"].id, again.summary
            )
        )
        == 2
    )


def test_the_recovery_job_checks_the_quota_again(
    client, session, skipped, cloud_quota, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    again = _stage(session, skipped["context"], skipped["data"])
    accepted, _ = _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")
    assert accepted.status_code == 202, accepted.text
    # The quota shrank to what the Space holds before the job runs.
    cloud_quota(quota.space_usage(session, skipped["target"].id))

    _run_apply_job(session, again)

    assert again.status == ImportStatus.READY_TO_APPLY
    assert again.error_code == "STORAGE_QUOTA_EXCEEDED"
    assert (
        len(
            transfers.recoverable_videos(
                session, skipped["target"].id, skipped["anna"].id, again.summary
            )
        )
        == 2
    )


def test_the_refusal_carries_no_partial_write(session, staged, cloud_quota) -> None:  # type: ignore[no-untyped-def]
    cloud_quota(staged["without_videos"] - 1)
    transfer: TransferImport = staged["transfer"]

    with pytest.raises(StorageQuotaExceededError):
        transfers.apply_import_bundle(
            session,
            staged["context"],
            transfer,
            io.BytesIO(staged["data"]),
            skip_videos=True,
        )

    assert _memory_count(session, staged["target"].id) == 0
    assert _usage(session, staged["target"].id) == 0
