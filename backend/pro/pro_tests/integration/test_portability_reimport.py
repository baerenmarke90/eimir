"""Importing the same bundle again never duplicates anything (#2141, #2150).

A repeated import adds only what the Space does not have: records and media it already has
from an earlier import of the same file, or because the file was exported from this Space,
stay exactly as they are. A record deleted since then comes back, once.
"""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment
from eimir.authorization import AuthorizationContext
from eimir.memories import service as memories
from eimir.memories.models import Memory
from pro_tests.support.portability import (
    couple,
    create_memory,
    export_bytes,
    import_bytes,
    target_space,
    upload_image,
    validate_bytes,
)
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


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
def bundle(client, session: Session, tmp_path: Path):  # type: ignore[no-untyped-def]
    """A shared export of a Space with two Memories and three photos."""
    pair = couple(session)
    source_id, token = pair["space"].id, pair["token_a"]
    lake = [upload_image(client, source_id, token, session) for _ in range(2)]
    create_memory(client, source_id, token, "A day at the lake", lake)
    create_memory(
        client, source_id, token, "Dinner", [upload_image(client, source_id, token, session)]
    )
    return {**pair, "data": export_bytes(session, pair["context"], tmp_path)}


def test_the_same_file_imported_twice_adds_nothing_the_second_time(session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)
    first = validate_bytes(session, context, bundle["data"]).summary
    assert first["alreadyPresentCount"] == 0
    import_bytes(session, context, bundle["data"])
    before = {memory.id: memory.version for memory in _memories(session, context.space_id)}
    attachments = _attachment_count(session, context.space_id)
    assert len(before) == 2 and attachments == 3

    summary = validate_bytes(session, context, bundle["data"]).summary
    second = import_bytes(session, context, bundle["data"])

    assert summary["alreadyPresentCount"] >= 5  # two Memories and three photos at least
    assert summary["newMediaCount"] == 0
    assert second.written_keys == []
    after = {memory.id: memory.version for memory in _memories(session, context.space_id)}
    assert after == before, "a repeated import must not add or change a Memory"
    assert _attachment_count(session, context.space_id) == attachments


def test_a_file_restored_into_its_own_space_duplicates_nothing(session, bundle) -> None:  # type: ignore[no-untyped-def]
    source = bundle["space"]
    context = AuthorizationContext(account_id=bundle["anna"].id, space_id=source.id)
    before = {memory.id for memory in _memories(session, source.id)}
    attachments = _attachment_count(session, source.id)

    summary = import_bytes(session, context, bundle["data"]).summary

    assert summary["alreadyPresentCount"] >= 5
    assert {memory.id for memory in _memories(session, source.id)} == before
    assert _attachment_count(session, source.id) == attachments


def test_a_deleted_memory_comes_back_once_and_the_rest_stays(session, bundle) -> None:  # type: ignore[no-untyped-def]
    context = target_space(session, bundle)
    import_bytes(session, context, bundle["data"])
    imported = {memory.payload.title: memory for memory in _memories(session, context.space_id)}
    lake, dinner = imported["A day at the lake"], imported["Dinner"]
    lake_gallery = _gallery(session, lake.id)
    dinner_version = dinner.version
    memories.delete_memory(session, context, lake.id, expected_version=lake.version)
    session.flush()

    import_bytes(session, context, bundle["data"])

    restored = _memories(session, context.space_id)
    assert sorted(memory.payload.title for memory in restored) == ["A day at the lake", "Dinner"]
    back = next(memory for memory in restored if memory.payload.title == "A day at the lake")
    # The same record lands on the same ID and finds its photos again.
    assert back.id == lake.id
    assert _gallery(session, back.id) == lake_gallery
    kept = next(memory for memory in restored if memory.payload.title == "Dinner")
    assert kept.version == dinner_version
    assert _attachment_count(session, context.space_id) == 3
