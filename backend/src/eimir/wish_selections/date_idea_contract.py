"""The date-idea contract a Wish selection round shares with the Pro catalog (Decision 0017, C18).

A round may contain curated date ideas next to Wishes. The round, its stored
idea IDs and revisions and its API projection are Core (Free) contract; the
editorial catalog, its texts and its images are Pro and reach Core only
through the plugin's ``date_ideas()`` source. Without that source the catalog
is unavailable: a round with date ideas stays in its existing paused state,
Wish-only rounds are unaffected, nothing is deleted and exports keep the IDs.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Protocol

from pydantic import Field

from eimir.api.schema import ApiModel

IDEA_ID_PATTERN = r"^eimir-date-(00[1-9]|0[1-9][0-9]|1[0-9]{2}|200)$"
"""Persistent editorial ID of a date idea; a Core contract constant."""


class DateIdeaPlaceType(StrEnum):
    HOME = "home"
    OUT = "out"


class DateIdeaCategory(StrEnum):
    FOOD_DRINK = "food_drink"
    CREATIVE = "creative"
    PLAY = "play"
    NATURE = "nature"
    CULTURE = "culture"
    MOVEMENT = "movement"
    RELAXATION = "relaxation"
    CONNECTION = "connection"
    MEMORIES = "memories"
    DISCOVERY = "discovery"


class DateIdeaImage(ApiModel):
    """Editorial image; fetch the bytes from `getDateIdeaImage` with `id`."""

    id: str
    width: int
    height: int
    alt: str = Field(description="Alternative text in the idea's `contentLocale`.")


class DateIdea(ApiModel):
    """One curated idea; all texts come from one locale entry."""

    id: str = Field(description="Persistent editorial ID. Never a Wish or Plan ID.")
    category: DateIdeaCategory
    place_type: DateIdeaPlaceType
    minutes: int = Field(description="Editorial time budget in minutes.")
    budget_eur_for_two: int = Field(
        description="Spending cap in whole EUR for two; 0 means no new spending."
    )
    title: str
    description: str
    wish_title: str = Field(description="Editable prefill for the Wish composer.")
    plan_title: str = Field(description="Editable prefill for the Plan composer.")
    prerequisites: list[str]
    content_locale: str = Field(description="Locale of all texts of this idea.")
    image: DateIdeaImage = Field(description="The idea's own image, otherwise its category image.")


class DateIdeaSource(Protocol):
    """The curated catalog as a Wish selection round needs it."""

    def revision(self, idea_id: str) -> str | None:
        """Return the idea's current editorial revision, or ``None`` if it is gone."""
        ...

    def view(self, idea_id: str, locale: str | None) -> DateIdea | None:
        """Return the idea's projection in the best catalog locale for ``locale``.

        Callers enforce the capability; an ID alone carries no copy.
        """
        ...
