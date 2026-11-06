"""Video validation stages private files outside long-lived attachment row locks."""

from __future__ import annotations

import io
import time
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import UUID

from sqlalchemy import String, cast, select
from sqlalchemy.orm import Session

from eimir.attachments import binding, service, videos
from eimir.attachments.limits import VIDEO_MAX_SIZE
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.attachments.upload_ownership import short_transaction
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.identity import models as _identity_models  # noqa: F401
from eimir.jobs.models import Job, JobStatus
from eimir.jobs.worker import registry
from eimir.media import get_media_store
from eimir.media.streams import CHUNK_SIZE, BoundedSource, ByteLimitExceededError
from eimir.relationship import models as _relationship_models  # noqa: F401
from eimir.security.errors import DecryptionError, PlaintextRejectedError

# The standalone role needs Account and Space metadata for Attachment writes.
# API imports and integration-fixture bootstrap must not be implicit dependencies.

RECOVERY_BATCH_SIZE = 100


def recover_stranded_validations(session: Session, *, limit: int = RECOVERY_BATCH_SIZE) -> int:
    """Resume only live videos stranded by the former standalone model defect."""
    jobs = session.scalars(
        select(Job)
        .join(Attachment, cast(Attachment.id, String) == Job.payload["attachmentId"].astext)
        .where(
            Job.kind == service.ATTACHMENT_VIDEO_VALIDATION,
            Job.status == JobStatus.FAILED.value,
            Job.last_error == "NoReferencedTableError",
            Attachment.status == AttachmentStatus.VALIDATING.value,
            Attachment.media_type == MediaType.VIDEO.value,
        )
        .order_by(Job.created_at, Job.id)
        .limit(limit)
        .with_for_update(of=Job, skip_locked=True)
    ).all()
    for job in jobs:
        job.status = JobStatus.PENDING.value
        job.attempts = 0
        job.run_after = now()
        job.finished_at = None
        job.locked_until = None
        job.locked_by = None
        job.last_error = None
    return len(jobs)


UploadIdentity = tuple[datetime | None, int, str]


class VideoParentChangedError(RuntimeError):
    """Retry a publication that raced the first binding, without inverted locks."""


def _identity(attachment: Attachment) -> UploadIdentity:
    return attachment.uploaded_at, attachment.declared_size, attachment.declared_mime_type


def _locked_current(
    session: Session, identifier: UUID, identity: UploadIdentity
) -> Attachment | None:
    # All gallery writers lock the parent before attachments. A first binding
    # discovered after the attachment lock requires a new job transaction.
    observed_parent = binding.parent_of(session, identifier)
    if observed_parent is not None:
        from eimir.heart_moments.models import HeartMoment
        from eimir.memories.models import Memory

        models: dict[str, type[Memory] | type[HeartMoment]] = {
            "MEMORY": Memory,
            "HEART_MOMENT": HeartMoment,
        }
        model = models.get(observed_parent[0])
        if model is None:
            return None
        session.scalar(select(model).where(model.id == observed_parent[1]).with_for_update())
    current = session.get(Attachment, identifier, with_for_update=True, populate_existing=True)
    if (
        current is None
        or current.status != AttachmentStatus.VALIDATING.value
        or _identity(current) != identity
    ):
        return None
    if binding.parent_of(session, identifier) != observed_parent:
        raise VideoParentChangedError("Video parent changed before publication.")
    return current


def _within_gallery_limit(session: Session, current: Attachment, result_size: int) -> bool:
    parent = binding.parent_of(session, current.id)
    if parent is None:
        return True
    if parent[0] == "MEMORY":
        entries = binding.attachments_of_memory(session, parent[1])
    else:
        from eimir.heart_moments import media
        from eimir.heart_moments.models import HeartMoment

        moment = session.get(HeartMoment, parent[1])
        entries = media.galleries(session, [moment]).get(parent[1], []) if moment else []
    total = result_size + sum(
        binding.reserved_size(entry.attachment)
        for entry in entries
        if entry.attachment.id != current.id
    )
    return total <= binding.MAX_GALLERY_TOTAL_SIZE


def _fail(source: Session, identifier: UUID, identity: UploadIdentity, code: str) -> None:
    with short_transaction(source) as session:
        attachment = _locked_current(session, identifier, identity)
        if attachment is not None:
            service._fail(attachment, code)
            binding.notify_video_failure(session, attachment)


def validate(source: Session, payload: dict[str, Any]) -> None:
    try:
        identifier = UUID(str(payload.get("attachmentId")))
    except ValueError:
        return
    with short_transaction(source) as session:
        attachment = session.get(Attachment, identifier)
        if (
            attachment is None
            or attachment.status != AttachmentStatus.VALIDATING
            or attachment.media_type != MediaType.VIDEO
        ):
            return
        identity = _identity(attachment)
        key = service.storage_key_for(attachment)
    if not get_settings().video_upload_enabled:
        _fail(source, identifier, identity, "ATTACHMENT_TYPE_NOT_ALLOWED")
        return
    store = get_media_store()
    try:
        with TemporaryDirectory(prefix="eimir-video-") as temporary:
            directory = Path(temporary)
            original = directory / "input.mov"
            deadline = time.monotonic() + 600
            with store.open(key) as raw, original.open("wb") as target:
                bounded = BoundedSource(raw, VIDEO_MAX_SIZE)
                while chunk := bounded.read(CHUNK_SIZE):
                    if time.monotonic() >= deadline:
                        raise videos.VideoRejectedError("VIDEO_PROCESSING_TIMEOUT")
                    target.write(chunk)
            result = videos.process(original, directory)
            with short_transaction(source) as session:
                current = _locked_current(session, identifier, identity)
                if current is None:
                    return
                if not _within_gallery_limit(session, current, result.size):
                    service._fail(current, "ATTACHMENT_LIMIT_EXCEEDED")
                    binding.notify_video_failure(session, current)
                    return
                # Cancellation/deletion wins before publication. From here the
                # same short provider-write barrier as ordinary uploads applies.
                with result.path.open("rb") as content:
                    store.put(service.storage_key_for(current), content, "video/mp4")
                current.mime_type = "video/mp4"
                current.size = result.size
                current.width, current.height = result.width, result.height
                current.duration_seconds = result.duration_seconds
                current.payload = AttachmentPayload(
                    original_name=current.payload.original_name,
                    is_sensitive=current.payload.is_sensitive,
                )
                if result.thumbnail is not None:
                    try:
                        store.put(
                            service.storage_key_for(current, "thumbnail"),
                            io.BytesIO(result.thumbnail),
                            "image/jpeg",
                        )
                        current.has_thumbnail = True
                    except OSError:
                        pass
                current.status = AttachmentStatus.READY.value
                current.ready_at = now()
                current.failure_code = None
    except ByteLimitExceededError:
        _fail(source, identifier, identity, "ATTACHMENT_TOO_LARGE")
    except (DecryptionError, PlaintextRejectedError):
        _fail(source, identifier, identity, "VIDEO_STORAGE_UNAVAILABLE")
    except videos.VideoRejectedError as error:
        _fail(source, identifier, identity, error.code)
    except OSError:
        _fail(source, identifier, identity, "VIDEO_STORAGE_UNAVAILABLE")


def register() -> None:
    if registry.get(service.ATTACHMENT_VIDEO_VALIDATION) is None:
        registry.register(service.ATTACHMENT_VIDEO_VALIDATION, validate)
