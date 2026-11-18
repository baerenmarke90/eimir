"""Validate bounded optional location content at the parent boundary."""

import pytest
from pydantic import ValidationError

from eimir.api.v1.heart_moments import HeartMomentCreate
from eimir.heart_moments.location import HeartMomentLocation
from eimir.heart_moments.models import HeartMomentPayload


@pytest.mark.parametrize(
    "changes",
    [
        {"name": " "},
        {"name": "x" * 201},
        {"address": "x" * 501},
        {"latitude": 91, "longitude": 7},
        {"latitude": 49},
        {"latitude": 49, "longitude": float("inf")},
        {"latitude": float("nan"), "longitude": 7},
        {"placeId": "shared-id"},
    ],
)
def test_invalid_location_content_is_rejected(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        HeartMomentLocation.model_validate({"name": "Quiet lake", **changes})


def test_legacy_payloads_default_to_no_location_and_name_only_is_valid() -> None:
    payload = HeartMomentPayload.model_validate({"text": "A thought", "emotion": "LOVED"})
    assert payload.location is None
    assert HeartMomentLocation(name="  Quiet lake  ").name == "Quiet lake"


def test_a_snapshot_cannot_be_combined_with_a_shared_place_link() -> None:
    with pytest.raises(ValidationError, match="cannot be combined"):
        HeartMomentCreate.model_validate(
            {
                "text": "A thought",
                "emotion": "LOVED",
                "visibility": "PRIVATE",
                "happenedOn": "2026-11-06",
                "placeId": "11111111-1111-4111-8111-111111111111",
                "location": {"name": "Quiet lake"},
            }
        )
