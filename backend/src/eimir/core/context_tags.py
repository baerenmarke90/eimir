"""Bounded authored labels shared by protected Memory and HeartMoment payloads."""

import unicodedata
from typing import Annotated

from pydantic import BeforeValidator, Field, StringConstraints


def normalize_tag(value: object) -> object:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", " ".join(value.split()))
    return value


ContextTag = Annotated[
    str, BeforeValidator(normalize_tag), StringConstraints(min_length=1, max_length=40)
]
ContextTags = Annotated[list[ContextTag], Field(max_length=8)]


def unique_tags(value: ContextTags | None) -> ContextTags | None:
    if value is not None and len(value) != len(set(value)):
        raise ValueError("Context tags must be unique")
    return value
