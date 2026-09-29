"""Closed context catalog for authored Heart Moments."""

from typing import Annotated, Literal

from pydantic import Field

HeartMomentTag = Literal["everyday", "out_together", "home", "special_day"]
HeartMomentTags = Annotated[list[HeartMomentTag], Field(max_length=4)]


def unique_tags(value: HeartMomentTags | None) -> HeartMomentTags | None:
    if value is not None and len(value) != len(set(value)):
        raise ValueError("Heart Moment tags must be unique")
    return value
