"""Imported videos are restored without Pro but never trusted as already validated."""

from __future__ import annotations

import hashlib
import io
import json
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import IO, Any
from zipfile import ZIP_STORED, ZipFile

import pytest
from sqlalchemy import select

from eimir.attachments import binding, service, video_jobs, videos
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.config import get_settings
from eimir.core.errors import ErrorCode
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability
from eimir.jobs.models import Job
from eimir.media import get_media_store
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, make_space, requires_database
from tests.support.video import grant
from tests.support.video import owner as owner

pytestmark = [pytest.mark.integration, requires_database]

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
    video_jobs.validate(session, {"attachmentId": identifier})
    session.expire_all()
    assert session.get(Attachment, identifier).status == AttachmentStatus.READY


@contextmanager
def _exported(session, owner) -> Iterator[tuple[IO[bytes], int]]:  # type: ignore[no-untyped-def]
    context = AuthorizationContext(account_id=owner[0].id, space_id=owner[1].id)
    with transfers.build_export_archive(session, context, TransferScope.SHARED) as bundle:
        bundle.seek(0, io.SEEK_END)
        size = bundle.tell()
        bundle.seek(0)
        yield bundle, size


def _forge(
    bundle: IO[bytes], change: Callable[[dict[str, bytes], dict[str, Any]], None]
) -> io.BytesIO:
    """Rewrite entries and recompute checksums, as a hostile bundle author can."""
    bundle.seek(0)
    with ZipFile(bundle) as archive:
        entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    index = json.loads(entries["media/index.json"])
    change(entries, index["items"][0])
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


def _apply(session, context: AuthorizationContext, bundle: IO[bytes], size: int) -> None:  # type: ignore[no-untyped-def]
    transfer = transfers.create_import(session, context, bundle, size=size)
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY, transfer.failure_code
    transfers.request_apply(session, context, str(transfer.id))
    jobs.handle_apply_import(session, {"importId": str(transfer.id)})
    session.flush()
    assert transfer.status == ImportStatus.COMPLETED


def _imported_video(session, space_id) -> Attachment:  # type: ignore[no-untyped-def]
    return session.scalars(
        select(Attachment).where(
            Attachment.space_id == space_id, Attachment.media_type == MediaType.VIDEO.value
        )
    ).one()


def test_imported_video_is_revalidated_and_restored_without_pro(
    client, session, owner, monkeypatch
):  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    # Restore is non-paywallable: the target Space has no video capability.
    assert not entitlements.has_capability(session, target.id, Capability.MEDIA_VIDEO_UPLOAD)

    with _exported(session, owner) as (bundle, _):
        # A hostile author replaces the bytes and the metadata the server used to trust.
        def tamper(entries: dict[str, bytes], item: dict[str, Any]) -> None:
            entries[f"media/{item['sourceId']}/original"] = FORGED_BYTES
            item["size"] = len(FORGED_BYTES)
            item["durationSeconds"] = 1
            item["width"], item["height"] = 1, 1

        forged = _forge(bundle, tamper)
        _apply(session, target_context, forged, forged.getbuffer().nbytes)

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
    job = session.scalars(
        select(Job).where(
            Job.kind == service.ATTACHMENT_VIDEO_VALIDATION,
            Job.payload["attachmentId"].astext == str(imported.id),
        )
    ).one()
    assert job is not None
    # The bundle's thumbnail is not copied; only the processor may produce one.
    assert not get_media_store().exists(service.storage_key_for(imported, "thumbnail"))

    # The same restricted video job as an upload decides publication, without Pro.
    monkeypatch.setattr(videos, "process", _processed(b"sanitized-target", duration=2))
    video_jobs.validate(session, {"attachmentId": str(imported.id)})
    session.refresh(imported)
    assert imported.status == AttachmentStatus.READY
    assert imported.mime_type == "video/mp4"
    assert imported.size == len(b"sanitized-target")
    assert imported.duration_seconds == 2
    with service.open_content(imported) as content:
        assert content.read() == b"sanitized-target"


def test_imported_video_rejected_by_the_processor_is_never_published(
    client, session, owner, monkeypatch
):  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    with _exported(session, owner) as (bundle, size):
        _apply(session, target_context, bundle, size)
    imported = _imported_video(session, target.id)

    def rejected(source: Path, directory: Path) -> videos.ProcessedVideo:
        raise videos.VideoRejectedError("VIDEO_INVALID")

    monkeypatch.setattr(videos, "process", rejected)
    video_jobs.validate(session, {"attachmentId": str(imported.id)})
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
    client, session, owner, monkeypatch, tamper
):  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    with _exported(session, owner) as (bundle, _):
        forged = _forge(bundle, tamper)
        with pytest.raises(TransferArchiveError) as error:
            transfers.validate_import_bundle(
                session, target_context, forged, compressed_size=forged.getbuffer().nbytes
            )
    assert error.value.code == ErrorCode.TRANSFER_RELATION_INVALID


def test_video_bundle_is_refused_where_no_video_processor_runs(client, session, owner, monkeypatch):  # type: ignore[no-untyped-def]
    _ready_source_video(client, session, owner, monkeypatch)
    target = make_space(session, owner[0])
    target_context = AuthorizationContext(account_id=owner[0].id, space_id=target.id)
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "false")
    get_settings.cache_clear()
    # Fail closed and keep the bundle usable: nothing is written or deleted.
    with (
        _exported(session, owner) as (bundle, size),
        pytest.raises(TransferArchiveError) as error,
    ):
        transfers.validate_import_bundle(session, target_context, bundle, compressed_size=size)
    assert error.value.code == ErrorCode.TRANSFER_FORMAT_UNSUPPORTED
    assert session.scalar(select(Attachment).where(Attachment.space_id == target.id)) is None
