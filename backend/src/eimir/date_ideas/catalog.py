"""Curated date-idea catalog (editorial handoff, schema version 1).

The catalog is editorial data, not code. ``data/catalog.json`` is the verbatim
editorial file; its format is the handoff JSON Schema published at
``docs/product/date-inspiration/catalog.schema.json``. The models below mirror
that schema and add the checks a JSON Schema cannot express (unique idea IDs).
The same models validate the bundled file at load and any replacement file
through ``scripts/date_ideas_catalog.py``, so a new catalog revision replaces
the file without code changes.

Rules from the handoff:

- Idea IDs (``eimir-date-001`` ... ``eimir-date-200``) are persistent editorial
  identifiers, stable across locales, copy edits and reordering. They are never
  Wish or Plan IDs; adopting an idea copies its text into an ordinary Wish or
  Plan through the existing composers.
- A missing locale uses the whole default-locale entry, never a field mix.
- Filters use structured metadata only. Upper bounds are inclusive; a budget
  of 0 means no new spending; no place filter ("anywhere") covers both places.
- Order is the editorial order of the file.
- No external content provider, AI service, scraping or location is involved.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from functools import cache, cached_property
from hashlib import sha256
from importlib.resources import files
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

# The shared vocabulary is Core contract (Decision 0017); re-exported for the catalog's users.
from eimir.wish_selections.date_idea_contract import (
    IDEA_ID_PATTERN as IDEA_ID_PATTERN,
)
from eimir.wish_selections.date_idea_contract import (
    DateIdeaCategory as DateIdeaCategory,
)
from eimir.wish_selections.date_idea_contract import (
    DateIdeaPlaceType as DateIdeaPlaceType,
)

SCHEMA_VERSION = 1
IDEA_COUNT = 200
CATALOG_VERSION_PATTERN = r"^1\.[0-9]+\.[0-9]+$"
MINUTES_MAX = 60
BUDGET_MAX = 20

# ``minLength: 1`` plus ``pattern: \S``: at least one visible character.
Label = Annotated[str, StringConstraints(min_length=1, max_length=48, pattern=r"\S")]
Title = Annotated[str, StringConstraints(min_length=1, max_length=70, pattern=r"\S")]
Description = Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r"\S")]
Prerequisite = Annotated[str, StringConstraints(min_length=1, max_length=145, pattern=r"\S")]


class _FileModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class LocalizedLabel(_FileModel):
    de: Label
    en: Label

    def get(self, locale: str) -> str:
        return self.en if locale == "en" else self.de


class PlaceTypeLabels(_FileModel):
    home: LocalizedLabel
    out: LocalizedLabel


class CategoryLabels(_FileModel):
    food_drink: LocalizedLabel
    creative: LocalizedLabel
    play: LocalizedLabel
    nature: LocalizedLabel
    culture: LocalizedLabel
    movement: LocalizedLabel
    relaxation: LocalizedLabel
    connection: LocalizedLabel
    memories: LocalizedLabel
    discovery: LocalizedLabel


class IdeaCopy(_FileModel):
    title: Title
    description: Description
    wish_title: Title = Field(alias="wishTitle")
    plan_title: Title = Field(alias="planTitle")
    prerequisites: Annotated[list[Prerequisite], Field(max_length=3)]

    @model_validator(mode="after")
    def _unique_prerequisites(self) -> Self:
        if len(set(self.prerequisites)) != len(self.prerequisites):
            raise ValueError("prerequisites must be unique")
        return self


class IdeaCopies(_FileModel):
    de: IdeaCopy
    en: IdeaCopy

    def get(self, locale: str) -> IdeaCopy:
        return self.en if locale == "en" else self.de


class CatalogIdea(_FileModel):
    id: Annotated[str, Field(pattern=IDEA_ID_PATTERN)]
    minutes: Annotated[int, Field(ge=1, le=MINUTES_MAX, strict=True)]
    budget_eur_for_two: Annotated[int, Field(ge=0, le=BUDGET_MAX, strict=True)] = Field(
        alias="budgetEurForTwo"
    )
    place_type: DateIdeaPlaceType = Field(alias="placeType")
    category: DateIdeaCategory
    texts: IdeaCopies = Field(alias="copy")


class CatalogFile(_FileModel):
    """Root of an editorial catalog file (schema version 1)."""

    schema_version: Literal[1] = Field(alias="schemaVersion")
    catalog_version: Annotated[str, Field(pattern=CATALOG_VERSION_PATTERN)] = Field(
        alias="catalogVersion"
    )
    default_locale: Literal["de"] = Field(alias="defaultLocale")
    locales: tuple[Literal["de"], Literal["en"]]
    currency: Literal["EUR"]
    place_type_labels: PlaceTypeLabels = Field(alias="placeTypeLabels")
    category_labels: CategoryLabels = Field(alias="categoryLabels")
    ideas: Annotated[list[CatalogIdea], Field(min_length=IDEA_COUNT, max_length=IDEA_COUNT)]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        problems = list(_consistency_problems(self))
        if problems:
            raise ValueError("; ".join(problems))
        return self


def _consistency_problems(catalog: CatalogFile) -> Iterable[str]:
    seen: set[str] = set()
    for idea in catalog.ideas:
        if idea.id in seen:
            yield f"duplicate idea id {idea.id!r}"
        seen.add(idea.id)


def removed_idea_ids(previous: CatalogFile, candidate: CatalogFile) -> list[str]:
    """IDs that ``candidate`` would drop. Persistent IDs must stay available."""
    kept = {idea.id for idea in candidate.ideas}
    return sorted(idea.id for idea in previous.ideas if idea.id not in kept)


def parse_catalog(raw: str | bytes) -> CatalogFile:
    """Parse and validate one catalog file; raises ``pydantic.ValidationError``."""
    return CatalogFile.model_validate_json(raw, by_alias=True)


# --- Resolved, read-only view ------------------------------------------------


@dataclass(frozen=True)
class ResolvedLabel:
    id: str
    label: str


@dataclass(frozen=True)
class ResolvedIdea:
    id: str
    category: DateIdeaCategory
    place_type: DateIdeaPlaceType
    minutes: int
    budget_eur_for_two: int
    title: str
    description: str
    wish_title: str
    plan_title: str
    prerequisites: tuple[str, ...]
    content_locale: str


@dataclass(frozen=True)
class IdeaFilter:
    """All criteria combine with AND; upper bounds are inclusive."""

    category: DateIdeaCategory | None = None
    max_minutes: int | None = None
    max_budget: int | None = None
    place: DateIdeaPlaceType | None = None

    def matches(self, idea: ResolvedIdea) -> bool:
        if self.category is not None and idea.category != self.category:
            return False
        if self.max_minutes is not None and idea.minutes > self.max_minutes:
            return False
        if self.max_budget is not None and idea.budget_eur_for_two > self.max_budget:
            return False
        return self.place is None or idea.place_type == self.place


class DateIdeaCatalog:
    """Validated catalog with locale resolution in editorial order."""

    def __init__(self, data: CatalogFile) -> None:
        self.data = data

    @property
    def version(self) -> str:
        return self.data.catalog_version

    @property
    def currency(self) -> str:
        return self.data.currency

    def resolve_locale(self, requested: str | None) -> str:
        """Exact supported locale, then its language, then the default locale."""
        if requested:
            tag = requested.strip().replace("_", "-").lower()
            for candidate in (tag, tag.split("-", 1)[0]):
                if candidate in self.data.locales:
                    return candidate
        return self.data.default_locale

    def categories(self, locale: str) -> list[ResolvedLabel]:
        labels = self.data.category_labels
        return [
            ResolvedLabel(id=category.value, label=getattr(labels, category.value).get(locale))
            for category in DateIdeaCategory
        ]

    def place_types(self, locale: str) -> list[ResolvedLabel]:
        labels = self.data.place_type_labels
        return [
            ResolvedLabel(id=place.value, label=getattr(labels, place.value).get(locale))
            for place in DateIdeaPlaceType
        ]

    @cached_property
    def _by_id(self) -> dict[str, CatalogIdea]:
        return {idea.id: idea for idea in self.data.ideas}

    def revision(self, idea_id: str) -> str | None:
        """Content fingerprint of one idea across all locales and metadata.

        Unrelated catalog edits keep it stable; any change to this idea's copy
        or structured facts changes it. ``None`` means the idea is not offered.
        """
        idea = self._by_id.get(idea_id)
        if idea is None:
            return None
        return sha256(idea.model_dump_json(by_alias=True).encode()).hexdigest()

    def idea(self, idea_id: str, locale: str) -> ResolvedIdea | None:
        idea = self._by_id.get(idea_id)
        return None if idea is None else self._resolve(idea, locale)

    def ideas(self, locale: str, idea_filter: IdeaFilter | None = None) -> list[ResolvedIdea]:
        resolved = [self._resolve(idea, locale) for idea in self.data.ideas]
        if idea_filter is None:
            return resolved
        return [idea for idea in resolved if idea_filter.matches(idea)]

    def _resolve(self, idea: CatalogIdea, locale: str) -> ResolvedIdea:
        # Every v1 idea carries both locales; anything else already resolved to
        # the default, so the whole entry always comes from one language.
        content_locale = locale if locale in self.data.locales else self.data.default_locale
        texts = idea.texts.get(content_locale)
        return ResolvedIdea(
            id=idea.id,
            category=idea.category,
            place_type=idea.place_type,
            minutes=idea.minutes,
            budget_eur_for_two=idea.budget_eur_for_two,
            title=texts.title,
            description=texts.description,
            wish_title=texts.wish_title,
            plan_title=texts.plan_title,
            prerequisites=tuple(texts.prerequisites),
            content_locale=content_locale,
        )


CATALOG_RESOURCE = "data/catalog.json"


def bundled_catalog_text() -> str:
    return files("eimir.date_ideas").joinpath(CATALOG_RESOURCE).read_text(encoding="utf-8")


@cache
def get_catalog() -> DateIdeaCatalog:
    """The bundled catalog, validated once per process."""
    return DateIdeaCatalog(parse_catalog(bundled_catalog_text()))
