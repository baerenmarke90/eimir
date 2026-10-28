"""Sensitive media is protected domain metadata, not a sharing boundary."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from eimir.api.v1.heart_moments import HeartMomentCreate
from eimir.api.v1.memories import MemoryAttachmentEntry
from eimir.attachments.binding import set_sensitive
from eimir.attachments.models import Attachment, AttachmentPayload


def test_legacy_payload_defaults_to_unmarked_and_mark_preserves_other_metadata() -> None:
    attachment = Attachment(payload=AttachmentPayload(original_name="unchanged.jpg", orientation=6))
    assert attachment.payload.is_sensitive is False
    set_sensitive(attachment, True)
    assert attachment.payload.model_dump() == {
        "original_name": "unchanged.jpg",
        "captured_at": None,
        "orientation": 6,
        "is_sensitive": True,
    }
    set_sensitive(attachment, None)
    assert attachment.payload.is_sensitive is True
    set_sensitive(attachment, False)
    assert attachment.payload.is_sensitive is False


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
