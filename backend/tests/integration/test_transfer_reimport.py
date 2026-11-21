"""Importing the same Transfer Bundle again never duplicates anything (#2141).

A repeated import adds only what the Space does not have: records and media it
already has from an earlier import of the same file, or because the file was
exported from this Space, stay exactly as they are. A record deleted since then
comes back, once.
"""

from __future__ import annotations

import io
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment
from eimir.authorization import AuthorizationContext
from eimir.memories import service as memories
from eimir.memories.models import Memory
from eimir.relationship import service as relationship_service
from eimir.transfer import jobs
from eimir.transfer import service as transfers
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration.test_transfer_video_gate import _image, _memory, _run_apply_job

pytestmark = [pytest.mark.integration, requires_database]


def _import(client, session: Session, context: AuthorizationContext, token: str, data: bytes):  # type: ignore[no-untyped-def]
    transfer = transfers.create_import(session, context, io.BytesIO(data), size=len(data))
    jobs.handle_validate_import(session, {"importId": str(transfer.id)})
    assert transfer.status == ImportStatus.READY_TO_APPLY, transfer.error_code
    path = f"/api/v1/spaces/{transfer.space_id}/transfer/imports/{transfer.id}"
    summary = client.get(path, headers=auth(token)).json()["summary"]
    accepted = client.post(path + "/apply", json={}, headers=auth(token))
    assert accepted.status_code == 202, accepted.text
    _run_apply_job(session, transfer)
    assert transfer.status == ImportStatus.COMPLETED, transfer.error_code
    return transfer, summary


def _memories(session: Session, space_id: UUID) -> list[Memory]:
    return list(session.scalars(select(Memory).where(Memory.space_id == space_id)))


def _attachment_count(session: Session, space_id: UUID) -> int:
    return int(
        session.scalar(
            select(func.count()).select_from(Attachment).where(Attachment.space_id == space_id)
        )
        or 0
    )


def _gallery(session: Session, memory_id: UUID) -> list[UUID]:
    return list(
        session.scalars(
            select(MemoryAttachment.attachment_id)
            .where(MemoryAttachment.memory_id == memory_id)
            .order_by(MemoryAttachment.position)
        )
    )


@pytest.fixture
def bundle(client, session: Session):  # type: ignore[no-untyped-def]
    """A shared export of a Space with two Memories and three photos."""
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    source = make_space(session, anna)
    relationship_service.add_member(session, source.id, ben)
    token = sign_in(session, anna)
    lake = [_image(client, source.id, token, session) for _ in range(2)]
    _memory(client, source.id, token, "A day at the lake", lake)
    _memory(client, source.id, token, "Dinner", [_image(client, source.id, token, session)])
    context = AuthorizationContext(account_id=anna.id, space_id=source.id)
    with transfers.build_export_archive(session, context, TransferScope.SHARED) as archive:
        archive.seek(0)
        data = archive.read()
    return {"anna": anna, "ben": ben, "source": source, "token": token, "data": data}


def _target(session: Session, bundle) -> AuthorizationContext:  # type: ignore[no-untyped-def]
    target = make_space(session, bundle["anna"])
    relationship_service.add_member(session, target.id, bundle["ben"])
    return AuthorizationContext(account_id=bundle["anna"].id, space_id=target.id)


def test_the_same_file_imported_twice_adds_nothing_the_second_time(client, session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = _target(session, bundle)
    _, first = _import(client, session, context, bundle["token"], bundle["data"])
    assert first["alreadyPresentCount"] == 0
    before = {memory.id: memory.version for memory in _memories(session, context.space_id)}
    attachments = _attachment_count(session, context.space_id)
    assert len(before) == 2 and attachments == 3

    second, summary = _import(client, session, context, bundle["token"], bundle["data"])

    assert summary["alreadyPresentCount"] >= 5  # two Memories and three photos at least
    assert summary["videoCount"] == 0
    after = {memory.id: memory.version for memory in _memories(session, context.space_id)}
    assert after == before, "a repeated import must not add or change a Memory"
    assert _attachment_count(session, context.space_id) == attachments
    assert second.summary is not None
    assert second.summary["alreadyPresentCount"] == summary["alreadyPresentCount"]


def test_a_file_restored_into_its_own_space_duplicates_nothing(client, session, bundle) -> None:  # type: ignore[no-untyped-def]
    source = bundle["source"]
    context = AuthorizationContext(account_id=bundle["anna"].id, space_id=source.id)
    before = {memory.id for memory in _memories(session, source.id)}
    attachments = _attachment_count(session, source.id)

    _, summary = _import(client, session, context, bundle["token"], bundle["data"])

    assert summary["alreadyPresentCount"] >= 5
    assert {memory.id for memory in _memories(session, source.id)} == before
    assert _attachment_count(session, source.id) == attachments


def test_a_deleted_memory_comes_back_once_and_the_rest_stays(client, session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = _target(session, bundle)
    _import(client, session, context, bundle["token"], bundle["data"])
    imported = {memory.payload.title: memory for memory in _memories(session, context.space_id)}
    lake, dinner = imported["A day at the lake"], imported["Dinner"]
    lake_gallery = _gallery(session, lake.id)
    dinner_version = dinner.version
    memories.delete_memory(session, context, lake.id, expected_version=lake.version)
    session.flush()

    _import(client, session, context, bundle["token"], bundle["data"])

    restored = _memories(session, context.space_id)
    assert sorted(memory.payload.title for memory in restored) == ["A day at the lake", "Dinner"]
    back = next(memory for memory in restored if memory.payload.title == "A day at the lake")
    # The same record lands on the same ID and finds its photos again.
    assert back.id == lake.id
    assert _gallery(session, back.id) == lake_gallery
    kept = next(memory for memory in restored if memory.payload.title == "Dinner")
    assert kept.version == dinner_version
    assert _attachment_count(session, context.space_id) == 3
