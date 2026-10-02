"""Memory tag compatibility and rejection at both API and protected boundaries."""

import pytest
from pydantic import ValidationError

from eimir.api.v1.memories import MemoryCreate, MemoryUpdate
from eimir.memories.models import MemoryPayload


def test_old_protected_memory_has_no_tags_and_tagged_content_round_trips() -> None:
    old = MemoryPayload.unseal({"title": "A day", "body": "Together"})
    assert old.tags == []
    tagged = MemoryPayload(title="A day", body="Together", tags=["home", "laughter"])
    assert MemoryPayload.unseal(tagged.seal()) == tagged


@pytest.mark.parametrize(
    "tags",
    [
        [""],
        ["   "],
        ["x" * 41],
        ["home", "home"],
        [str(i) for i in range(9)],
        [" Urlaub ", "Urlaub"],
    ],
)
def test_invalid_tags_are_rejected_by_create_update_and_storage(tags: list[str]) -> None:
    with pytest.raises(ValidationError):
        MemoryCreate(title="A day", tags=tags)
    with pytest.raises(ValidationError):
        MemoryUpdate(tags=tags)
    with pytest.raises(ValidationError):
        MemoryPayload(title="A day", body="Together", tags=tags)


def test_tags_can_be_cleared_but_not_set_to_null() -> None:
    assert MemoryUpdate(tags=[]).tags == []
    with pytest.raises(ValidationError):
        MemoryUpdate(tags=None)


def test_custom_labels_normalize_and_round_trip_with_legacy_keys() -> None:
    tags = ["home", " Unser   Urlaub ", "Cafe\u0301", "🌅" * 40]
    expected = ["home", "Unser Urlaub", "Café", "🌅" * 40]
    assert MemoryCreate(title="A day", tags=tags).tags == expected
    assert MemoryUpdate(tags=tags).tags == expected
    payload = MemoryPayload(title="A day", body="Together", tags=tags)
    assert payload.tags == expected
    assert MemoryPayload.unseal(payload.seal()).tags == expected
