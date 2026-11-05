"""Sensitive media is protected domain metadata, not a sharing boundary."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from eimir.api.v1.heart_moments import HeartMomentCreate
from eimir.api.v1.memories import MemoryAttachmentEntry, _memory_attachments
from eimir.attachments.binding import BoundAttachment, can_edit_sensitivity, set_sensitive
from eimir.attachments.models import Attachment, AttachmentPayload
from eimir.authorization import AuthorizationContext
from eimir.core.errors import ForbiddenError
from eimir.memories.models import Memory, MemoryPayload


@pytest.mark.parametrize("preserve_metadata", [False, True])
def test_legacy_payload_defaults_to_unmarked_and_mark_preserves_other_metadata(
    preserve_metadata: bool,
) -> None:
    legacy_payload = AttachmentPayload(original_name="unchanged.jpg", orientation=6)
    assert legacy_payload.is_sensitive is False
    assert legacy_payload.preserve_metadata is False
    attachment = Attachment(
        payload=legacy_payload.model_copy(update={"preserve_metadata": preserve_metadata})
    )
    set_sensitive(attachment, True)
    assert attachment.payload.model_dump() == {
        "original_name": "unchanged.jpg",
        "captured_at": None,
        "orientation": 6,
        "is_sensitive": True,
        "preserve_metadata": preserve_metadata,
    }
    set_sensitive(attachment, None)
    assert attachment.payload.is_sensitive is True
    set_sensitive(attachment, False)
    assert attachment.payload.is_sensitive is False
    assert attachment.payload.preserve_metadata is preserve_metadata


@pytest.mark.parametrize("is_sensitive", [False, True])
def test_collaborative_content_edit_preserves_another_authors_classification(
    is_sensitive: bool,
) -> None:
    attachment = Attachment(
        payload=AttachmentPayload(original_name="protected.jpg", is_sensitive=is_sensitive)
    )
    for unchanged in (None, is_sensitive):
        set_sensitive(attachment, unchanged, allow_change=False)
    with pytest.raises(ForbiddenError):
        set_sensitive(attachment, not is_sensitive, allow_change=False)
    assert attachment.payload.is_sensitive is is_sensitive


@pytest.mark.parametrize("flag", ["false", 0, 1, [], {}])
def test_write_contract_rejects_coerced_classification(flag: object) -> None:
    with pytest.raises(ValidationError):
        MemoryAttachmentEntry.model_validate(
            {"attachmentId": str(uuid4()), "position": 0, "isSensitive": flag}
        )


def test_create_cannot_claim_classification_without_a_photo() -> None:
    with pytest.raises(ValidationError):
        HeartMomentCreate.model_validate(
            {
                "text": "Words",
                "emotion": "LOVED",
                "visibility": "SHARED",
                "happenedOn": "2026-10-28",
                "attachmentIsSensitive": True,
            }
        )


@pytest.mark.parametrize("viewer", ["parent", "uploader", "partner"])
def test_bound_summary_projects_individual_classification_authority(viewer: str) -> None:
    parent_id, uploader_id, partner_id, space_id = (uuid4() for _ in range(4))
    viewer_id = {"parent": parent_id, "uploader": uploader_id, "partner": partner_id}[viewer]
    photo = Attachment(
        id=uuid4(),
        owner_id=uploader_id,
        space_id=space_id,
        status="READY",
        media_type="IMAGE",
        mime_type="image/jpeg",
        size=100,
        width=10,
        height=10,
        has_thumbnail=False,
        payload=AttachmentPayload(original_name="selected.jpg"),
    )
    memory = Memory(owner_id=parent_id, payload=MemoryPayload(title="A moment", body="Words"))
    summary = _memory_attachments(
        AuthorizationContext(account_id=viewer_id, space_id=space_id),
        memory,
        [BoundAttachment(photo, 0)],
    )[0]
    allowed = viewer in {"parent", "uploader"}
    assert summary.can_edit_sensitivity is allowed
    assert summary.model_dump(by_alias=True)["canEditSensitivity"] is allowed
    assert can_edit_sensitivity(photo, account_id=viewer_id, parent_owner_id=parent_id) is allowed
    if allowed:
        set_sensitive(photo, True, allow_change=summary.can_edit_sensitivity)
        assert photo.payload.is_sensitive is True
    else:
        with pytest.raises(ForbiddenError):
            set_sensitive(photo, True, allow_change=summary.can_edit_sensitivity)
        assert photo.payload.is_sensitive is False
