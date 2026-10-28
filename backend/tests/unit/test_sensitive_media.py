"""Sensitive media is protected domain metadata, not a sharing boundary."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from eimir.api.v1.heart_moments import HeartMomentCreate
from eimir.api.v1.memories import MemoryAttachmentEntry
from eimir.attachments.binding import set_sensitive
from eimir.attachments.models import Attachment, AttachmentPayload


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
