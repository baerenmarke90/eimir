"""Imported photos and PDFs are checked like uploads and restored without loss."""

from __future__ import annotations

import hashlib
import io
import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime
from typing import IO, Any
from uuid import UUID
from zipfile import ZIP_STORED, ZipFile

import pytest
from PIL import Image
from sqlalchemy import select

from eimir.attachments import service
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ErrorCode
from eimir.media import get_media_store
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, make_space, requires_database
from tests.integration.test_plan_images_and_editor import _upload_pdf
from tests.integration.test_related_person_attachments import couple as couple

pytestmark = [pytest.mark.integration, requires_database]

HTML = b"<html><script>alert(1)</script></html>"
CAPTURED_AT = datetime(2025, 6, 13, 18, 30, 5)


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


def _source_plan(client, couple, session) -> tuple[Attachment, str]:  # type: ignore[no-untyped-def]
    """A Free Space Plan with one photo and one PDF, as a couple would export it."""
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
    assert source.payload.orientation == 6
    assert (source.width, source.height) == (40, 20)
    assert source.has_thumbnail is True
    return source, pdf


@contextmanager
def _exported(session, couple) -> Iterator[tuple[IO[bytes], int]]:  # type: ignore[no-untyped-def]
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    with transfers.build_export_archive(session, context, TransferScope.SHARED) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        yield bundle, size


Change = Callable[[dict[str, bytes], dict[str, Any]], None]


def _forge(bundle: IO[bytes], media_type: str, change: Change) -> io.BytesIO:
    """Rewrite one media item and recompute checksums, as a hostile bundle author can."""
    bundle.seek(0)
    with ZipFile(bundle) as archive:
        entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    index = json.loads(entries["media/index.json"])
    item = next(entry for entry in index["items"] if entry["mediaType"] == media_type)
    change(entries, item)
    entries["media/index.json"] = json.dumps(index).encode()
    manifest = json.loads(entries["manifest.json"])
    for name in manifest["checksums"]:
        manifest["checksums"][name] = hashlib.sha256(entries[name]).hexdigest()
    entries["manifest.json"] = json.dumps(manifest).encode()
    forged = io.BytesIO()
    with ZipFile(forged, "w", compression=ZIP_STORED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    bundle.seek(0)
    forged.seek(0)
    return forged


def _replace(variant: str, content: bytes, **fields: Any) -> Change:
    def change(entries: dict[str, bytes], item: dict[str, Any]) -> None:
        entries[f"media/{item['sourceId']}/{variant}"] = content
        if variant == "original":
            item["size"] = len(content)
        item.update(fields)

    return change


def _set(**fields: Any) -> Change:
    return lambda entries, item: item.update(fields)


def _target(session, couple) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    target = make_space(session, couple["anna"])
    relationship_service.add_member(session, target.id, couple["ben"])
    return AuthorizationContext(account_id=couple["anna"].id, space_id=target.id)


def test_restored_photo_keeps_bytes_capture_time_orientation_and_thumbnail(client, couple, session):  # type: ignore[no-untyped-def]
    source, _ = _source_plan(client, couple, session)
    store = get_media_store()
    with service.open_content(source) as content:
        source_bytes = content.read()
    target = _target(session, couple)
    with _exported(session, couple) as (bundle, size):
        transfer = transfers.create_import(session, target, bundle, size=size)
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY, transfer.error_code
    transfers.request_apply(session, target, str(transfer.id))
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED, transfer.error_code

    restored = session.scalars(
        select(Attachment).where(
            Attachment.space_id == target.space_id,
            Attachment.media_type == MediaType.IMAGE.value,
        )
    ).one()
    # Restore is Free and immediate: no Pro, no second encode, no lost metadata.
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
def test_forged_photo_is_rejected_before_anything_is_written(client, couple, session, change):  # type: ignore[no-untyped-def]
    _source_plan(client, couple, session)
    target = _target(session, couple)
    with _exported(session, couple) as (bundle, _):
        forged = _forge(bundle, "IMAGE", change)
        with pytest.raises(TransferArchiveError) as error:
            transfers.validate_import_bundle(
                session, target, forged, compressed_size=forged.getbuffer().nbytes
            )
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
def test_forged_pdf_is_rejected_before_anything_is_written(client, couple, session, change):  # type: ignore[no-untyped-def]
    _source_plan(client, couple, session)
    target = _target(session, couple)
    with _exported(session, couple) as (bundle, _):
        forged = _forge(bundle, "DOCUMENT", change)
        with pytest.raises(TransferArchiveError) as error:
            transfers.validate_import_bundle(
                session, target, forged, compressed_size=forged.getbuffer().nbytes
            )
    assert error.value.code == ErrorCode.TRANSFER_RELATION_INVALID
