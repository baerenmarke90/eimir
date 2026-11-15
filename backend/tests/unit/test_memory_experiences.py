"""Regression contracts for the #1618 calendar/gallery extension."""

from datetime import date
from uuid import uuid4

import pytest
from pydantic import ValidationError as SchemaValidationError

from eimir.api.v1.heart_moments import HeartMomentCreate, HeartMomentUpdate
from eimir.api.v1.memories import MemoryUpdate
from eimir.attachments.binding import BoundAttachment, cover_of
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus
from eimir.core.errors import ValidationError
from eimir.memories.create_receipts import fingerprint
from eimir.memories.periods import merged_intervals, validate_period


def test_period_is_inclusive_and_needs_a_valid_start() -> None:
    validate_period(None, None)
    validate_period(date(2026, 12, 31), date(2027, 1, 3))
    validate_period(date(2026, 12, 31), date(2026, 12, 31))
    for starts, through in ((None, date(2027, 1, 3)), (date(2027, 1, 3), date(2026, 12, 31))):
        with pytest.raises(ValidationError, match="period"):
            validate_period(starts, through)


def test_receipts_distinguish_the_end_and_ordered_places_without_changing_old_requests() -> None:
    values = {"title": "Weekend", "body": "", "happened_on": date(2026, 12, 31)}
    original = fingerprint(**values)
    assert original == fingerprint(**values, happened_until=None, place_ids=None)
    assert original != fingerprint(**values, happened_until=date(2027, 1, 3))
    first, second = uuid4(), uuid4()
    assert fingerprint(**values, place_ids=[first, second]) != fingerprint(
        **values, place_ids=[second, first]
    )


def test_cover_identity_survives_reorder_and_automatic_mode_follows_the_first_ready_medium() -> (
    None
):
    first = Attachment(
        id=uuid4(),
        status=AttachmentStatus.READY.value,
        payload=AttachmentPayload(original_name="first.jpg"),
    )
    second = Attachment(
        id=uuid4(),
        status=AttachmentStatus.READY.value,
        payload=AttachmentPayload(original_name="second.jpg", is_sensitive=True),
    )
    entries = [BoundAttachment(first, 0), BoundAttachment(second, 1)]
    assert cover_of(entries, second.id) is second
    reordered = [BoundAttachment(second, 0), BoundAttachment(first, 1)]
    assert cover_of(reordered, first.id) is first
    assert cover_of(reordered, None) is second
    assert cover_of([BoundAttachment(first, 0)], second.id) is first
    assert second.payload.is_sensitive


def test_place_replacement_requires_the_membership_observed_by_the_editor() -> None:
    first, second = uuid4(), uuid4()
    with pytest.raises(SchemaValidationError):
        MemoryUpdate.model_validate({"placeIds": [str(first)]})
    value = MemoryUpdate.model_validate(
        {"placeIds": [str(second), str(first)], "expectedPlaceIds": [str(first)]}
    )
    assert value.place_ids == [second, first]


def test_heart_gallery_accepts_media_only_but_rejects_ambiguous_or_gapped_bindings() -> None:
    base = {"text": "", "emotion": "LOVED", "visibility": "PRIVATE", "happenedOn": "2026-11-01"}
    identifier = str(uuid4())
    value = HeartMomentCreate.model_validate(
        {
            **base,
            "attachments": [{"attachmentId": identifier, "position": 0}],
            "selectedCoverAttachmentId": identifier,
        }
    )
    assert value.attachments and str(value.attachments[0].attachment_id) == identifier
    for update in (
        {"attachments": [{"attachmentId": identifier, "position": 1}]},
        {"attachments": [], "attachmentId": identifier},
    ):
        with pytest.raises(SchemaValidationError):
            HeartMomentUpdate.model_validate(update)


def test_calendar_expansion_coalesces_overlapping_periods_before_enumerating() -> None:
    assert merged_intervals([(2026, 2027), (2027, 2030), (2026, 2028), (2032, 2032)]) == [
        (2026, 2030),
        (2032, 2032),
    ]
