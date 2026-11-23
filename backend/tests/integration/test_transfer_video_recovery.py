"""Skipped videos are remembered and can be recovered from the same file (#2141).

An import without videos remembers each video where it belonged. A later import
of the same file can add exactly these videos (`VIDEOS_ONLY`), which counts as
a video upload. The remembered rows follow their gallery, owner and Space and
are never exported. These are Core tests and run in both plugin configurations;
where the video capability is needed it is granted by replacing the decision
`videos_allowed`, because the real processor is plugin code.
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.memories.models import Memory
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus, Space
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.models import ImportStatus, TransferImport, TransferScope, TransferSkippedVideo
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_transfer_video_gate import (
    _forge_videos,
    _image,
    _memory,
    _run_apply_job,
)

pytestmark = [pytest.mark.integration, requires_database]


def _stage(session: Session, context: AuthorizationContext, data: bytes) -> TransferImport:
    transfer = transfers.create_import(session, context, io.BytesIO(data), size=len(data))
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY, transfer.error_code
    return transfer


def _path(transfer: TransferImport) -> str:
    return f"/api/v1/spaces/{transfer.space_id}/transfer/imports/{transfer.id}"


def _apply(client, session, transfer: TransferImport, token: str, mode: str):  # type: ignore[no-untyped-def]
    path = _path(transfer)
    return client.post(path + "/apply", json={"mode": mode}, headers=auth(token)), path


@pytest.fixture
def skipped(client, session: Session):  # type: ignore[no-untyped-def]
    """A target Space that imported a bundle without its two videos."""
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    token = sign_in(session, anna)
    first, clip, last, lonely_clip = (_image(client, source.id, token, session) for _ in range(4))
    gallery = _memory(client, source.id, token, "A day at the lake", [first, clip, last])
    _memory(client, source.id, token, "Only a clip", [lonely_clip])
    source_context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    with transfers.build_export_archive(session, source_context, TransferScope.SHARED) as bundle:
        data = _forge_videos(bundle, {clip, lonely_clip}, gallery, clip, ben.id, last).getvalue()
    target = make_space(session, anna)
    relationship_service.add_member(session, target.id, ben)
    context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    first_import = _stage(session, context, data)
    accepted, _ = _apply(client, session, first_import, token, "WITHOUT_VIDEOS")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, first_import)
    assert first_import.status == ImportStatus.COMPLETED, first_import.error_code
    return {
        "anna": anna,
        "ben": ben,
        "target": target,
        "context": context,
        "token": token,
        "data": data,
        "sources": {UUID(clip), UUID(lonely_clip)},
    }


def _rows(session: Session, space_id: UUID) -> list[TransferSkippedVideo]:
    return list(
        session.scalars(
            select(TransferSkippedVideo).where(TransferSkippedVideo.space_id == space_id)
        )
    )


def _memories(session: Session, space_id: UUID) -> dict[str, Memory]:
    return {
        memory.payload.title: memory
        for memory in session.scalars(select(Memory).where(Memory.space_id == space_id))
    }


def test_each_skipped_video_is_remembered_where_it_belonged(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    rows = _rows(session, skipped["target"].id)
    memories = _memories(session, skipped["target"].id)
    assert {row.source_attachment_id for row in rows} == skipped["sources"]
    by_memory = {row.memory_id: row for row in rows}
    assert by_memory[memories["A day at the lake"].id].position == 1
    assert by_memory[memories["Only a clip"].id].position == 0
    assert all(row.heart_moment_id is None and len(row.checksum) == 64 for row in rows)
    assert {row.owner_id for row in rows} == {skipped["anna"].id}

    listed = client.get(
        f"/api/v1/spaces/{skipped['target'].id}/transfer/skipped-videos",
        headers=auth(skipped["token"]),
    )
    assert listed.status_code == 200, listed.text
    assert listed.json()["count"] == 2 and listed.json()["totalSize"] > 0


def test_the_same_file_offers_recovery_but_never_without_the_capability(
    client, session, skipped
) -> None:  # type: ignore[no-untyped-def]
    again = _stage(session, skipped["context"], skipped["data"])
    summary = client.get(_path(again), headers=auth(skipped["token"])).json()["summary"]
    assert summary["recoverableVideoCount"] == 2

    refused, _ = _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")
    assert refused.status_code == 409, refused.text
    assert refused.json()["code"] == "TRANSFER_VIDEOS_NEED_PRO"
    session.refresh(again)
    assert again.status == ImportStatus.READY_TO_APPLY
    assert len(_rows(session, skipped["target"].id)) == 2


def test_recovering_adds_exactly_the_remembered_videos(
    client, session, skipped, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    target = skipped["target"].id
    before = _memories(session, target)
    versions = {title: memory.version for title, memory in before.items()}
    again = _stage(session, skipped["context"], skipped["data"])
    accepted, path = _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, again)
    assert again.status == ImportStatus.COMPLETED, again.error_code

    # Nothing else was imported a second time.
    assert set(_memories(session, target)) == set(before)
    assert session.scalar(
        select(func.count()).select_from(Memory).where(Memory.space_id == target)
    ) == len(before)
    videos = list(
        session.scalars(
            select(Attachment).where(
                Attachment.space_id == target, Attachment.media_type == MediaType.VIDEO.value
            )
        )
    )
    assert len(videos) == 2
    assert {video.status for video in videos} == {AttachmentStatus.VALIDATING.value}
    for title, position in (("A day at the lake", 2), ("Only a clip", 0)):
        memory = session.get(Memory, before[title].id)
        session.refresh(memory)
        rows = list(
            session.scalars(
                select(MemoryAttachment)
                .where(MemoryAttachment.memory_id == memory.id)
                .order_by(MemoryAttachment.position)
            )
        )
        assert rows[-1].position == position
        assert rows[-1].attachment_id in {video.id for video in videos}
        assert memory.version == versions[title] + 1
    assert _rows(session, target) == []
    summary = client.get(path, headers=auth(skipped["token"])).json()["summary"]
    assert summary["recoveredVideoCount"] == 2
    assert summary["unrecoveredVideoCount"] == 0

    # A second recovery from the same file finds nothing left to add.
    third = _stage(session, skipped["context"], skipped["data"])
    nothing, _ = _apply(client, session, third, skipped["token"], "VIDEOS_ONLY")
    assert nothing.status_code == 409, nothing.text
    assert nothing.json()["code"] == "TRANSFER_NOTHING_TO_RECOVER"


def test_a_changed_file_recovers_nothing(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    # Same source IDs, different bytes: the checksum no longer matches.
    source = io.BytesIO(skipped["data"])
    with zipfile.ZipFile(source) as archive:
        entries = {entry.filename: archive.read(entry) for entry in archive.infolist()}
    for identifier in skipped["sources"]:
        entries[f"media/{identifier}/original"] += b"changed"
        index = json.loads(entries["media/index.json"])
        for item in index["items"]:
            if item["sourceId"] == str(identifier):
                item["size"] = len(entries[f"media/{identifier}/original"])
        entries["media/index.json"] = json.dumps(index).encode()
    manifest = json.loads(entries["manifest.json"])
    for name in manifest["checksums"]:
        manifest["checksums"][name] = hashlib.sha256(entries[name]).hexdigest()
    entries["manifest.json"] = json.dumps(manifest).encode()
    changed = io.BytesIO()
    with zipfile.ZipFile(changed, "w", compression=zipfile.ZIP_STORED) as archive:
        for name, content in entries.items():
            archive.writestr(name, content)
    again = _stage(session, skipped["context"], changed.getvalue())
    assert (
        client.get(_path(again), headers=auth(skipped["token"])).json()["summary"][
            "recoverableVideoCount"
        ]
        == 0
    )


def test_a_full_gallery_keeps_the_video_remembered(client, session, skipped, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    # The lake gallery already holds two photos; allow no third item.
    monkeypatch.setattr(transfers, "MAX_GALLERY_ATTACHMENTS", 2)
    again = _stage(session, skipped["context"], skipped["data"])
    _apply(client, session, again, skipped["token"], "VIDEOS_ONLY")
    _run_apply_job(session, again)
    assert again.status == ImportStatus.COMPLETED, again.error_code
    remaining = _rows(session, skipped["target"].id)
    lake = _memories(session, skipped["target"].id)["A day at the lake"]
    assert [row.memory_id for row in remaining] == [lake.id]
    assert again.summary is not None
    assert again.summary["recoveredVideoCount"] == 1
    assert again.summary["unrecoveredVideoCount"] == 1


def test_remembered_videos_follow_their_memory_owner_and_space(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    target = skipped["target"].id
    clip_only = _memories(session, target)["Only a clip"]
    client.delete(
        f"/api/v1/spaces/{target}/memories/{clip_only.id}",
        headers={**auth(skipped["token"]), "If-Match": f'"{clip_only.version}"'},
    ).raise_for_status()
    session.expire_all()
    assert len(_rows(session, target)) == 1

    # Account deletion removes the owner's remembered videos.
    apply_accepted_tombstone(session, skipped["anna"].id, accepted_at=now())
    apply_core_cleanup(session, skipped["anna"].id)
    session.flush()
    assert _rows(session, target) == []


def test_space_retention_purges_remembered_videos(session, skipped, tmp_path, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    from datetime import timedelta

    from eimir.media.local import LocalMediaStore
    from eimir.relationship import policy, retention

    target = skipped["target"].id
    ended_at = now() - policy.SPACE_OFFBOARDING_RETENTION - timedelta(days=1)
    for membership in session.scalars(select(Membership).where(Membership.space_id == target)):
        membership.status = MembershipStatus.LEFT.value
        membership.ended_at = ended_at
    space = session.get(Space, target)
    assert space is not None
    space.offboarding_purge_at = policy.purge_eligible_at(ended_at)
    session.flush()
    monkeypatch.setattr(retention, "get_media_store", lambda: LocalMediaStore(tmp_path))
    purged, _, _ = retention.purge_due_spaces(session, current_time=now())
    session.flush()
    assert purged >= 1
    assert _rows(session, target) == []


def test_remembered_videos_are_not_exported_and_can_be_dismissed(client, session, skipped) -> None:  # type: ignore[no-untyped-def]
    target = skipped["target"].id
    with (
        transfers.build_export_archive(session, skipped["context"], TransferScope.SHARED) as bundle,
        zipfile.ZipFile(bundle) as archive,
    ):
        names = archive.namelist()
        content = b"".join(archive.read(name) for name in names if name.endswith(".json"))
    assert b"transfer_skipped_videos" not in content
    assert all(str(source).encode() not in content for source in skipped["sources"])

    dismissed = client.delete(
        f"/api/v1/spaces/{target}/transfer/skipped-videos", headers=auth(skipped["token"])
    )
    assert dismissed.status_code == 204, dismissed.text
    assert _rows(session, target) == []
    assert len(_memories(session, target)) == 2


def test_a_heart_moment_video_is_remembered_and_recovered_as_its_own_media(
    client, session, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    from eimir.heart_moments.models import HeartMoment

    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    token = sign_in(session, anna)
    clip = _image(client, source.id, token, session)
    created = client.post(
        f"/api/v1/spaces/{source.id}/heart-moments",
        json={
            "text": "Thank you for today.",
            "emotion": "LOVED",
            "visibility": "SHARED",
            "happenedOn": "2026-06-13",
            "attachmentId": clip,
        },
        headers=auth(token),
    )
    assert created.status_code == 201, created.text
    source_context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    with transfers.build_export_archive(session, source_context, TransferScope.SHARED) as bundle:
        data = _forge_videos(bundle, {clip}, "no-memory", clip, ben.id, clip).getvalue()
    target = make_space(session, anna)
    relationship_service.add_member(session, target.id, ben)
    context = AuthorizationContext(account_id=anna.id, space_id=target.id)
    first_import = _stage(session, context, data)
    _apply(client, session, first_import, token, "WITHOUT_VIDEOS")
    _run_apply_job(session, first_import)
    assert first_import.status == ImportStatus.COMPLETED, first_import.error_code

    moment = session.scalars(select(HeartMoment).where(HeartMoment.space_id == target.id)).one()
    assert moment.attachment_id is None
    (row,) = _rows(session, target.id)
    assert (row.heart_moment_id, row.memory_id, row.position) == (moment.id, None, 0)

    monkeypatch.setattr(transfers, "videos_allowed", lambda *args: True)
    again = _stage(session, context, data)
    _apply(client, session, again, token, "VIDEOS_ONLY")
    _run_apply_job(session, again)
    assert again.status == ImportStatus.COMPLETED, again.error_code
    session.refresh(moment)
    video = session.get(Attachment, moment.attachment_id)
    assert video is not None and video.media_type == MediaType.VIDEO.value
    assert _rows(session, target.id) == []
