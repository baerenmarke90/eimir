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


@pytest.mark.parametrize("tags", [["unknown"], ["home", "home"], ["home"] * 5])
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
