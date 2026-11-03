"""Video validation stages private files outside long-lived attachment row locks."""

from __future__ import annotations

import io
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from eimir.attachments import service, videos
from eimir.attachments.limits import VIDEO_MAX_SIZE
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.attachments.upload_ownership import short_transaction
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.jobs.worker import registry
from eimir.media import get_media_store
from eimir.media.streams import CHUNK_SIZE, BoundedSource, ByteLimitExceededError
from eimir.security.errors import DecryptionError, PlaintextRejectedError


def _fail(source: Session, identifier: UUID, version: int, code: str) -> None:
    with short_transaction(source) as session:
        attachment = session.get(Attachment, identifier, with_for_update=True)
        if (
            attachment is not None
            and attachment.status == AttachmentStatus.VALIDATING
            and attachment.version == version
        ):
            service._fail(attachment, code)


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
        version = attachment.version
        key = service.storage_key_for(attachment)
    if not get_settings().video_upload_enabled:
        _fail(source, identifier, version, "ATTACHMENT_TYPE_NOT_ALLOWED")
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
                current = session.get(Attachment, identifier, with_for_update=True)
                if (
                    current is None
                    or current.status != AttachmentStatus.VALIDATING
                    or current.version != version
                ):
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
        _fail(source, identifier, version, "ATTACHMENT_TOO_LARGE")
    except (DecryptionError, PlaintextRejectedError):
        _fail(source, identifier, version, "VIDEO_STORAGE_UNAVAILABLE")
    except videos.VideoRejectedError as error:
        _fail(source, identifier, version, error.code)
    except OSError:
        _fail(source, identifier, version, "VIDEO_STORAGE_UNAVAILABLE")


def register() -> None:
    if registry.get(service.ATTACHMENT_VIDEO_VALIDATION) is None:
        registry.register(service.ATTACHMENT_VIDEO_VALIDATION, validate)
