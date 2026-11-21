"""A video in a Transfer Bundle counts as a video upload (#2141).

A Space that cannot import videos (no `media.video_upload`, or no video
processor, as on a server without the plugin) is asked first. Without the
member's confirmation nothing changes; with it, everything else is imported and
the videos are left out cleanly. These are Core tests and run in both plugin
configurations.
"""

from __future__ import annotations

import hashlib
import io
import json
from typing import IO
from uuid import UUID
from zipfile import ZIP_STORED, ZipFile

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments import service as attachments
from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.jobs.models import Job
from eimir.memories.models import Memory
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.models import ImportStatus, TransferImport, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def _image(client, space_id, token, session) -> str:  # type: ignore[no-untyped-def]
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 20, 30)).save(buffer, "JPEG")
    content = buffer.getvalue()
    base = f"/api/v1/spaces/{space_id}/attachments"
    created = client.post(
        base,
        json={
            "mediaType": "IMAGE",
            "originalName": "photo.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(token),
    )
    assert created.status_code == 201, created.text
    identifier = created.json()["attachment"]["id"]
    client.put(f"{base}/{identifier}/content", content=content, headers=auth(token))
    client.post(f"{base}/{identifier}/finalize", json={}, headers=auth(token))
    attachments.validate(session, UUID(identifier))
    session.flush()
    return str(identifier)


def _memory(client, space_id, token, title: str, photos: list[str]) -> str:  # type: ignore[no-untyped-def]
    base = f"/api/v1/spaces/{space_id}/memories"
    created = client.post(
        base, json={"title": title, "happenedOn": "2026-06-13"}, headers=auth(token)
    )
    assert created.status_code == 201, created.text
    bound = client.put(
        f"{base}/{created.json()['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": photo, "position": index} for index, photo in enumerate(photos)
            ]
        },
        headers={**auth(token), "If-Match": f'"{created.json()["version"]}"'},
    )
    assert bound.status_code == 200, bound.text
    return str(created.json()["id"])


def _forge_videos(
    bundle: IO[bytes], videos: set[str], memory_id: str, cover: str, partner: UUID, kept: str
) -> io.BytesIO:
    """Mark exported photos as videos, as a bundle with real videos carries them.

    The marked photo is also the cover of the Memory and carries a reaction, so
    leaving it out must touch the gallery, the cover and the reactions.
    """
    bundle.seek(0)
    with ZipFile(bundle) as archive:
        entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    index = json.loads(entries["media/index.json"])
    for item in index["items"]:
        if item["sourceId"] in videos:
            item.update(mediaType="VIDEO", mimeType="video/mp4", variants=["original"])
    entries["media/index.json"] = json.dumps(index).encode()
    document = json.loads(entries.get("memories.json", b'{"tables": []}'))
    for group in document["tables"]:
        if group["name"] != "memories":
            continue
        for row in group["rows"]:
            if row["id"] == memory_id:
                row["payload"]["selected_cover_attachment_id"] = cover
                row["payload"]["photo_reactions"] = [
                    {"attachment_id": cover, "account_id": str(partner), "reaction": "LOVE"},
                    {"attachment_id": kept, "account_id": str(partner), "reaction": "LAUGH"},
                ]
    if "memories.json" in entries:
        entries["memories.json"] = json.dumps(document).encode()
    manifest = json.loads(entries["manifest.json"])
    for name in manifest["checksums"]:
        manifest["checksums"][name] = hashlib.sha256(entries[name]).hexdigest()
    entries["manifest.json"] = json.dumps(manifest).encode()
    forged = io.BytesIO()
    with ZipFile(forged, "w", compression=ZIP_STORED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    forged.seek(0)
    return forged


@pytest.fixture
def staged(client, session: Session):  # type: ignore[no-untyped-def]
    """A Free target Space with a validated import of a bundle that holds two videos."""
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    token = sign_in(session, anna)
    first, clip, last, lonely_clip = (_image(client, source.id, token, session) for _ in range(4))
    gallery = _memory(client, source.id, token, "A day at the lake", [first, clip, last])
    _memory(client, source.id, token, "Only a clip", [lonely_clip])
    source_context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    with transfers.build_export_archive(session, source_context, TransferScope.SHARED) as bundle:
        forged = _forge_videos(bundle, {clip, lonely_clip}, gallery, clip, ben.id, last)
    target = make_space(session, anna)
    relationship_service.add_member(session, target.id, ben)
    context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    transfer = transfers.create_import(session, context, forged, size=forged.getbuffer().nbytes)
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY, transfer.error_code
    return {
        "transfer": transfer,
        "target": target,
        "token": token,
        "path": f"/api/v1/spaces/{target.id}/transfer/imports/{transfer.id}",
        "ben": ben,
    }


def _run_apply_job(session: Session, transfer: TransferImport) -> None:
    """Run the queued apply job with the payload the confirmation recorded."""
    session.flush()
    job = session.get(Job, transfer.apply_job_id)
    assert job is not None
    jobs.handle_apply_import(session, dict(job.payload))


def _videos(session: Session, space_id: UUID) -> list[Attachment]:
    return list(
        session.scalars(
            select(Attachment).where(
                Attachment.space_id == space_id, Attachment.media_type == MediaType.VIDEO.value
            )
        )
    )


def test_the_preview_tells_that_the_videos_need_pro(client, staged) -> None:  # type: ignore[no-untyped-def]
    detail = client.get(staged["path"], headers=auth(staged["token"]))
    assert detail.status_code == 200, detail.text
    summary = detail.json()["summary"]
    assert summary["videoCount"] == 2
    assert summary["videoBytes"] > 0
    assert summary["videosNeedPro"] is True
    assert summary["skippedVideoCount"] == 0


def test_without_confirmation_a_bundle_with_videos_changes_nothing(client, session, staged) -> None:  # type: ignore[no-untyped-def]
    for body in (None, {"mode": "ALL"}):
        refused = client.post(staged["path"] + "/apply", json=body, headers=auth(staged["token"]))
        assert refused.status_code == 409, refused.text
        assert refused.json()["code"] == "TRANSFER_VIDEOS_NEED_PRO"
    session.refresh(staged["transfer"])
    assert staged["transfer"].status == ImportStatus.READY_TO_APPLY
    assert staged["transfer"].apply_job_id is None
    assert session.scalar(select(Memory).where(Memory.space_id == staged["target"].id)) is None


def test_with_confirmation_everything_but_the_videos_arrives_consistently(
    client, session, staged
) -> None:  # type: ignore[no-untyped-def]
    accepted = client.post(
        staged["path"] + "/apply", json={"mode": "WITHOUT_VIDEOS"}, headers=auth(staged["token"])
    )
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, staged["transfer"])
    session.flush()
    assert staged["transfer"].status == ImportStatus.COMPLETED, staged["transfer"].error_code
    assert _videos(session, staged["target"].id) == []

    memories = {
        memory.payload.title: memory
        for memory in session.scalars(select(Memory).where(Memory.space_id == staged["target"].id))
    }
    assert set(memories) == {"A day at the lake", "Only a clip"}
    lake = memories["A day at the lake"]
    rows = list(
        session.scalars(
            select(MemoryAttachment)
            .where(MemoryAttachment.memory_id == lake.id)
            .order_by(MemoryAttachment.position)
        )
    )
    assert [row.position for row in rows] == [0, 1]
    assert lake.payload.selected_cover_attachment_id is None
    assert [reaction.attachment_id for reaction in lake.payload.photo_reactions] == [
        rows[1].attachment_id
    ]
    clip_only = memories["Only a clip"]
    assert (
        session.scalar(select(MemoryAttachment).where(MemoryAttachment.memory_id == clip_only.id))
        is None
    )

    detail = client.get(staged["path"], headers=auth(staged["token"]))
    assert detail.json()["summary"]["skippedVideoCount"] == 2


def test_an_apply_body_with_unknown_fields_is_rejected(client, staged) -> None:  # type: ignore[no-untyped-def]
    rejected = client.post(
        staged["path"] + "/apply",
        json={"mode": "WITHOUT_VIDEOS", "force": True},
        headers=auth(staged["token"]),
    )
    assert rejected.status_code == 422


def test_a_capability_lost_after_the_confirmation_fails_the_import_unchanged(
    session, staged, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    # The apply job re-checks: a job queued with videos but run without the
    # capability fails and writes nothing.
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    context = AuthorizationContext(
        account_id=staged["transfer"].created_by, space_id=staged["target"].id
    )
    transfers.request_apply(session, context, str(staged["transfer"].id))
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: False)
    _run_apply_job(session, staged["transfer"])
    session.flush()
    transfer = session.get(TransferImport, staged["transfer"].id)
    assert transfer is not None and transfer.status == ImportStatus.FAILED
    assert transfer.error_code == "TRANSFER_VIDEOS_NEED_PRO"
    assert session.scalar(select(Memory).where(Memory.space_id == staged["target"].id)) is None
