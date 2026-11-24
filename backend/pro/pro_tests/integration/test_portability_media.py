"""Imported media is checked like an upload and restored without loss.

Photos and PDFs are decoded again and must match their claims. Audio and video are never
trusted: they enter ``VALIDATING`` and run the same worker job as an upload. The operator path
has no storage quota and no Pro video gate, but validation is the same (Decision 0020).
"""

from __future__ import annotations

import io
import json
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from eimir_pro.portability.archive import TransferArchiveError
from eimir_pro.video_processing import jobs as video_validation
from eimir_pro.video_processing import videos
from PIL import Image
from sqlalchemy import select

from eimir.attachments import binding, service
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ErrorCode
from eimir.jobs.models import Job
from eimir.media import get_media_store
from pro_tests.support.portability import (
    export_bytes,
    forge,
    import_bytes,
    target_space,
    validate_bytes,
)
from tests.conftest import auth, make_space, requires_database
from tests.integration.test_plan_images_and_editor import _upload_pdf
from tests.integration.test_related_person_attachments import couple as couple
from tests.support.video import grant
from tests.support.video import owner as owner

pytestmark = [pytest.mark.integration, requires_database]

HTML = b"<html><script>alert(1)</script></html>"
CAPTURED_AT = datetime(2025, 6, 13, 18, 30, 5)
Change = Callable[[dict[str, bytes], dict[str, Any]], None]


def _photo_bytes() -> bytes:
    """A camera-like JPEG: landscape pixels, capture time and a rotation flag."""
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x9003] = CAPTURED_AT.strftime("%Y:%m:%d %H:%M:%S")
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), (200, 120, 40)).save(buffer, "JPEG", exif=exif.tobytes())
    return buffer.getvalue()


def _upload_photo(client, couple, session) -> str:  # type: ignore[no-untyped-def]
    content = _photo_bytes()
    base = f"/api/v1/spaces/{couple['space'].id}/attachments"
    headers = auth(couple["token_a"])
    created = client.post(
        base,
        json={
            "mediaType": "IMAGE",
            "originalName": "photo.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    identifier = created.json()["attachment"]["id"]
    assert client.put(f"{base}/{identifier}/content", content=content, headers=headers).is_success
    assert client.post(f"{base}/{identifier}/finalize", json={}, headers=headers).is_success
    service.validate(session, UUID(identifier))
    session.flush()
    return str(identifier)


def _source_plan(client, couple, session) -> Attachment:  # type: ignore[no-untyped-def]
    """A Space Plan with one photo and one PDF, as a couple would have it."""
    photo = _upload_photo(client, couple, session)
    pdf, _ = _upload_pdf(client, couple, session, couple["token_a"])
    created = client.post(
        f"/api/v1/spaces/{couple['space'].id}/plans",
        json={
            "title": "Portable plan",
            "fileAttachmentIds": [pdf],
            "attachments": [{"attachmentId": photo, "position": 0}],
        },
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201, created.text
    source = session.get(Attachment, UUID(photo))
    assert source.status == AttachmentStatus.READY
    assert source.payload.captured_at == CAPTURED_AT
    assert (source.width, source.height) == (40, 20)
    assert source.has_thumbnail is True
    return source


def _context(couple) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    return AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)


def _forged(data: bytes, media_type: str, change: Change) -> bytes:
    def rewrite(entries: dict[str, bytes]) -> None:
        index = json.loads(entries["media/index.json"])
        item = next(entry for entry in index["items"] if entry["mediaType"] == media_type)
        change(entries, item)
        entries["media/index.json"] = json.dumps(index).encode()

    return forge(data, rewrite)


def _replace(variant: str, content: bytes, **fields: Any) -> Change:
    def change(entries: dict[str, bytes], item: dict[str, Any]) -> None:
        entries[f"media/{item['sourceId']}/{variant}"] = content
        if variant == "original":
            item["size"] = len(content)
        item.update(fields)

    return change


def _set(**fields: Any) -> Change:
    return lambda entries, item: item.update(fields)


def test_restored_photo_keeps_bytes_capture_time_orientation_and_thumbnail(
    client, couple, session, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    source = _source_plan(client, couple, session)
    store = get_media_store()
    with service.open_content(source) as content:
        source_bytes = content.read()
    target = target_space(session, couple)

    import_bytes(session, target, export_bytes(session, _context(couple), tmp_path))

    restored = session.scalars(
        select(Attachment).where(
            Attachment.space_id == target.space_id,
            Attachment.media_type == MediaType.IMAGE.value,
        )
    ).one()
    # Restore is immediate: no second encode, no lost metadata.
    assert restored.status == AttachmentStatus.READY
    assert restored.mime_type == restored.declared_mime_type == "image/jpeg"
    assert (restored.width, restored.height) == (40, 20)
    assert restored.size == len(source_bytes)
    assert restored.payload.captured_at == CAPTURED_AT
    assert restored.payload.orientation == 6
    assert restored.has_thumbnail is True
    with service.open_content(restored) as content:
        assert content.read() == source_bytes
    assert store.exists(service.storage_key_for(restored, "thumbnail"))


@pytest.mark.parametrize(
    "change",
    [
        pytest.param(_replace("original", HTML, mimeType="text/html"), id="html-type"),
        pytest.param(_set(mimeType="image/svg+xml"), id="svg-type"),
        pytest.param(_replace("original", HTML), id="html-bytes-as-jpeg"),
        pytest.param(_set(mimeType="image/png"), id="declared-type-mismatch"),
        pytest.param(_set(size=1), id="size-claim"),
        pytest.param(_set(width=4000, height=3000), id="dimension-claim"),
        pytest.param(_set(orientation=99), id="orientation-out-of-range"),
        pytest.param(_set(capturedAt="not-a-date"), id="capture-time-garbage"),
        pytest.param(_replace("thumbnail", HTML), id="html-thumbnail"),
        pytest.param(_set(mediaType="SCRIPT"), id="unknown-media-type"),
    ],
)
def test_forged_photo_is_rejected_before_anything_is_written(
    client, couple, session, tmp_path: Path, change: Change
) -> None:  # type: ignore[no-untyped-def]
    _source_plan(client, couple, session)
    target = target_space(session, couple)
    forged = _forged(export_bytes(session, _context(couple), tmp_path), "IMAGE", change)

    with pytest.raises(TransferArchiveError) as error:
        import_bytes(session, target, forged)

    assert error.value.code == ErrorCode.TRANSFER_RELATION_INVALID
    assert session.scalar(select(Attachment).where(Attachment.space_id == target.space_id)) is None


@pytest.mark.parametrize(
    "change",
    [
        pytest.param(_replace("original", HTML, mimeType="text/html"), id="html-type"),
        pytest.param(_replace("original", HTML), id="html-bytes-as-pdf"),
        pytest.param(_set(size=1), id="size-claim"),
    ],
)
def test_forged_pdf_is_rejected_before_anything_is_written(
    client, couple, session, tmp_path: Path, change: Change
) -> None:  # type: ignore[no-untyped-def]
    _source_plan(client, couple, session)
    target = target_space(session, couple)
    forged = _forged(export_bytes(session, _context(couple), tmp_path), "DOCUMENT", change)

    with pytest.raises(TransferArchiveError) as error:
        import_bytes(session, target, forged)

    assert error.value.code == ErrorCode.TRANSFER_RELATION_INVALID
    assert session.scalar(select(Attachment).where(Attachment.space_id == target.space_id)) is None


# --- video ------------------------------------------------------------------------------

FORGED_BYTES = b"<html><script>alert(1)</script></html>"


def _processed(payload: bytes, *, duration: int = 1) -> Callable[..., videos.ProcessedVideo]:
    def process(source: Path, directory: Path) -> videos.ProcessedVideo:
        output = directory / "sanitized.mp4"
        output.write_bytes(payload)
        return videos.ProcessedVideo(output, len(payload), 96, 64, duration, None)

    return process


def _ready_source_video(client, session, owner, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Upload, bind and publish one video in a Pro source Space."""
    grant(session, owner)
    base = f"/api/v1/spaces/{owner[1].id}"
    created = client.post(
        base + "/attachments",
        json={
            "mediaType": "VIDEO",
            "expectedMimeType": "video/mp4",
            "expectedSize": 10,
            "originalName": "our-video.mp4",
        },
        headers=auth(owner[2]),
    )
    assert created.status_code == 201, created.text
    identifier = created.json()["attachment"]["id"]
    path = f"{base}/attachments/{identifier}"
    assert (
        client.put(path + "/content", content=b"0123456789", headers=auth(owner[2])).status_code
        == 204
    )
    assert client.post(path + "/finalize", json={}, headers=auth(owner[2])).status_code == 202
    memory = client.post(base + "/memories", headers=auth(owner[2]), json={"title": "A saved day"})
    assert memory.status_code == 201, memory.text
    bound = client.put(
        base + f"/memories/{memory.json()['id']}/attachments",
        headers={**auth(owner[2]), "If-Match": str(memory.json()["version"])},
        json={"attachments": [{"attachmentId": identifier, "position": 0}]},
    )
    assert bound.status_code == 200, bound.text
    monkeypatch.setattr(videos, "process", _processed(b"sanitized-source", duration=2))
    video_validation.validate_video(session, {"attachmentId": identifier})
    session.expire_all()
    assert session.get(Attachment, identifier).status == AttachmentStatus.READY


def _owner_context(owner) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    return AuthorizationContext(account_id=owner[0].id, space_id=owner[1].id)


def _imported_video(session, space_id) -> Attachment:  # type: ignore[no-untyped-def]
    return session.scalars(
        select(Attachment).where(
            Attachment.space_id == space_id, Attachment.media_type == MediaType.VIDEO.value
        )
    ).one()


def test_imported_video_is_revalidated_like_an_upload(
    client, session, owner, monkeypatch, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)

    # A hostile author replaces the bytes and the metadata the server used to trust.
    def tamper(entries: dict[str, bytes], item: dict[str, Any]) -> None:
        entries[f"media/{item['sourceId']}/original"] = FORGED_BYTES
        item["size"] = len(FORGED_BYTES)
        item["durationSeconds"] = 1
        item["width"], item["height"] = 1, 1

    forged = _forged(export_bytes(session, _owner_context(owner), tmp_path), "VIDEO", tamper)
    result = import_bytes(session, target_context, forged)

    imported = _imported_video(session, target.id)
    # Untrusted bytes are never published as a validated video.
    assert imported.status == AttachmentStatus.VALIDATING
    assert imported.mime_type is None
    assert imported.size is None
    assert imported.duration_seconds is None
    assert imported.width is None and imported.height is None
    assert imported.has_thumbnail is False
    assert imported.ready_at is None
    assert binding.parent_of(session, imported.id) is not None
    assert result.summary["newVideoCount"] == 1
    job = session.scalars(
        select(Job).where(
            Job.kind == service.ATTACHMENT_VIDEO_VALIDATION,
            Job.payload["attachmentId"].astext == str(imported.id),
        )
    ).one()
    assert job is not None
    # The bundle's thumbnail is not copied; only the processor may produce one.
    assert not get_media_store().exists(service.storage_key_for(imported, "thumbnail"))

    # The same restricted video job as an upload decides publication.
    monkeypatch.setattr(videos, "process", _processed(b"sanitized-target", duration=2))
    video_validation.validate_video(session, {"attachmentId": str(imported.id)})
    session.refresh(imported)
    assert imported.status == AttachmentStatus.READY
    assert imported.mime_type == "video/mp4"
    assert imported.size == len(b"sanitized-target")
    assert imported.duration_seconds == 2
    with service.open_content(imported) as content:
        assert content.read() == b"sanitized-target"


def test_the_operator_import_has_no_video_capability_gate(
    client, session, owner, monkeypatch, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    """A Free target Space takes the video: the operator is responsible, the validation decides."""
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])  # no media.video_upload capability granted
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)

    import_bytes(session, target_context, export_bytes(session, _owner_context(owner), tmp_path))

    imported = _imported_video(session, target.id)
    assert imported.status == AttachmentStatus.VALIDATING


def test_imported_video_rejected_by_the_processor_is_never_published(
    client, session, owner, monkeypatch, tmp_path: Path
) -> None:  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    import_bytes(session, target_context, export_bytes(session, _owner_context(owner), tmp_path))
    imported = _imported_video(session, target.id)

    def rejected(source: Path, directory: Path) -> videos.ProcessedVideo:
        raise videos.VideoRejectedError("VIDEO_INVALID")

    monkeypatch.setattr(videos, "process", rejected)
    video_validation.validate_video(session, {"attachmentId": str(imported.id)})
    session.refresh(imported)
    assert imported.status == AttachmentStatus.FAILED
    assert imported.failure_code == "VIDEO_INVALID"


@pytest.mark.parametrize(
    "tamper",
    [
        pytest.param(lambda entries, item: item.update(mimeType="text/html"), id="html-type"),
        pytest.param(lambda entries, item: item.update(mimeType="image/svg+xml"), id="image-type"),
        pytest.param(lambda entries, item: item.update(size=1), id="size-claim"),
        pytest.param(
            lambda entries, item: item.update(size=250 * 1024 * 1024 + 1), id="oversized-claim"
        ),
    ],
)
def test_forged_video_metadata_is_rejected_before_anything_is_written(
    client, session, owner, monkeypatch, tmp_path: Path, tamper: Change
) -> None:  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    forged = _forged(export_bytes(session, _owner_context(owner), tmp_path), "VIDEO", tamper)

    with pytest.raises(TransferArchiveError) as error:
        validate_bytes(session, target_context, forged)

    assert error.value.code == ErrorCode.TRANSFER_RELATION_INVALID
    assert session.scalar(select(Attachment).where(Attachment.space_id == target.id)) is None
