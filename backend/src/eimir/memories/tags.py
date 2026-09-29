"""Small, versioned Memory context catalog shared by write and storage validation."""

from typing import Annotated, Literal

from pydantic import Field

MemoryTag = Literal["out_together", "laughter", "home", "special_day"]
MemoryTags = Annotated[list[MemoryTag], Field(max_length=4)]


def unique_tags(value: MemoryTags | None) -> MemoryTags | None:
    if value is None:
        return None
    if len(value) != len(set(value)):
        raise ValueError("Memory tags must be unique")
    return value
