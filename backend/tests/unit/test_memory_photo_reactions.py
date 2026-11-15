"""Protected reaction compatibility and transfer reference boundaries."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from eimir.authorization import AuthorizationContext
from eimir.memories.models import Memory, MemoryPayload
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.models import TransferScope
from eimir.transfer.service import ValidatedGraph, _prepare_row, _validate_photo_reactions


def test_legacy_payloads_default_to_no_reactions_and_reject_duplicates_or_custom_values():
    assert MemoryPayload(title="Legacy", body="").photo_reactions == []
    entry = {"account_id": str(uuid4()), "attachment_id": str(uuid4()), "reaction": "LOVE"}
    for reactions in [[entry, entry], [{**entry, "reaction": "custom"}]]:
        with pytest.raises(ValidationError):
            MemoryPayload.model_validate(
                {"title": "Memory", "body": "", "photo_reactions": reactions}
            )


def test_transfer_validates_and_remaps_protected_photo_and_member_references():
    member, photo, memory, space = uuid4(), uuid4(), uuid4(), uuid4()
    target_member, target_photo, target_memory, target_space = uuid4(), uuid4(), uuid4(), uuid4()
    raw = {
        "id": str(memory),
        "payload": {
            "title": "Memory",
            "body": "",
            "photo_reactions": [
                {"account_id": str(member), "attachment_id": str(photo), "reaction": "LIKE"}
            ],
        },
    }
    tables = {
        "memories": [raw],
        "memory_attachments": [{"memory_id": str(memory), "attachment_id": str(photo)}],
    }
    _validate_photo_reactions(tables, {member})
    with pytest.raises(TransferArchiveError):
        _validate_photo_reactions(tables, {uuid4()})
    with pytest.raises(TransferArchiveError):
        _validate_photo_reactions({"memories": [raw]}, {member})
    graph = ValidatedGraph(
        scope=TransferScope.SHARED,
        source_space_id=space,
        personal_owner_source_id=None,
        mapping={member: target_member},
        tables=tables,
        media=[],
        summary={},
    )
    prepared = _prepare_row(
        Memory.__table__,
        raw,
        graph=graph,
        authorization=AuthorizationContext(account_id=target_member, space_id=target_space),
        ids={photo: target_photo, memory: target_memory},
    )
    protected = prepared["payload"]
    assert protected.photo_reactions[0].account_id == target_member
    assert protected.photo_reactions[0].attachment_id == target_photo
    assert protected.photo_reactions[0].reaction == "LIKE"
