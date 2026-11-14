"""Versioned, curated catalog of date ideas for couples.

The catalog is editorial data, not code. It lives in a separate machine-readable
JSON file (``data/catalog.json``) whose format is defined by the models below
(``schemaVersion`` 1). The same models validate the bundled file at startup and
any replacement file through ``scripts/date_ideas_catalog.py`` before it is
imported, so the final editorial catalog can replace the development dataset
without changing code.

Design rules:

- Idea IDs are stable, permanent identifiers. A Wish created from an idea keeps
  the ID as provenance, so an import must never drop or reuse an ID; ideas are
  retired with ``active: false`` instead.
- Titles, descriptions, requirements and category labels are localized inside
  the catalog. A missing translation falls back to ``defaultLocale``.
- Filters use structured metadata only (category, duration, budget, setting);
  no free text, profile or behavioral signal participates.
- Order is editorial and deterministic: ``sortKey`` and then ``id``.
- No external content provider, AI service, scraping or location is involved.
"""

from __future__ import annotations

import json
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass
from enum import StrEnum
from functools import cache
from importlib.resources import files
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from eimir.api.schema import to_camel

SCHEMA_VERSION = 1

IDEA_ID_PATTERN = r"^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$"
CATEGORY_ID_PATTERN = r"^[a-z][a-z0-9_]{1,31}$"
LOCALE_PATTERN = r"^[a-z]{2,3}(?:-[A-Z]{2})?$"

# Upper bounds keep one idea readable on a phone and inside a Wish payload.
TITLE_MAX = 80
DESCRIPTION_MAX = 320
REQUIREMENT_MAX = 100
REQUIREMENTS_PER_IDEA_MAX = 5
CATEGORY_LABEL_MAX = 32
IDEAS_MAX = 2000
DURATION_MINUTES_MAX = 2880
BUDGET_MAX = 10000


class DurationBand(StrEnum):
    """Filterable duration groups derived from an idea's upper duration bound."""

    SHORT = "SHORT"
    """Up to 90 minutes."""
    EVENING = "EVENING"
    """Up to four hours."""
    LONG = "LONG"
    """More than four hours, such as a half or whole day."""


class BudgetBand(StrEnum):
    """Filterable budget groups for two people, in the catalog currency."""

    FREE = "FREE"
    """No expected cost."""
    LOW = "LOW"
    """Up to 30."""
    MEDIUM = "MEDIUM"
    """Up to 80."""
    HIGH = "HIGH"
    """More than 80."""


class DateSetting(StrEnum):
    """Where an idea takes place."""

    HOME = "HOME"
    OUT = "OUT"
    EITHER = "EITHER"


class SettingFilter(StrEnum):
    """Setting filter. ``EITHER`` ideas match both filters."""

    HOME = "HOME"
    OUT = "OUT"


_SHORT_MAX_MINUTES = 90
_EVENING_MAX_MINUTES = 240
_LOW_MAX_BUDGET = 30
_MEDIUM_MAX_BUDGET = 80


def duration_band(max_minutes: int) -> DurationBand:
    if max_minutes <= _SHORT_MAX_MINUTES:
        return DurationBand.SHORT
    if max_minutes <= _EVENING_MAX_MINUTES:
        return DurationBand.EVENING
    return DurationBand.LONG


def budget_band(max_amount: int) -> BudgetBand:
    if max_amount <= 0:
        return BudgetBand.FREE
    if max_amount <= _LOW_MAX_BUDGET:
        return BudgetBand.LOW
    if max_amount <= _MEDIUM_MAX_BUDGET:
        return BudgetBand.MEDIUM
    return BudgetBand.HIGH


# --- File format (schemaVersion 1) -------------------------------------------

Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class _FileModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        frozen=True,
    )


class CatalogCategory(_FileModel):
    id: Annotated[str, Field(pattern=CATEGORY_ID_PATTERN)]
    labels: dict[str, Annotated[Text, Field(max_length=CATEGORY_LABEL_MAX)]]


class IdeaContent(_FileModel):
    title: Annotated[Text, Field(max_length=TITLE_MAX)]
    description: Annotated[Text, Field(max_length=DESCRIPTION_MAX)]
    requirements: Annotated[
        list[Annotated[Text, Field(max_length=REQUIREMENT_MAX)]],
        Field(max_length=REQUIREMENTS_PER_IDEA_MAX),
    ] = Field(default_factory=list)


class MinutesRange(_FileModel):
    min: Annotated[int, Field(ge=5, le=DURATION_MINUTES_MAX)]
    max: Annotated[int, Field(ge=5, le=DURATION_MINUTES_MAX)]

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.max < self.min:
            raise ValueError("max must not be smaller than min")
        return self


class AmountRange(_FileModel):
    min: Annotated[int, Field(ge=0, le=BUDGET_MAX)]
    max: Annotated[int, Field(ge=0, le=BUDGET_MAX)]

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.max < self.min:
            raise ValueError("max must not be smaller than min")
        return self


class CatalogIdea(_FileModel):
    id: Annotated[str, Field(pattern=IDEA_ID_PATTERN)]
    active: bool = True
    sort_key: Annotated[int, Field(ge=0, le=1_000_000)]
    category: Annotated[str, Field(pattern=CATEGORY_ID_PATTERN)]
    duration_minutes: MinutesRange
    budget_for_two: AmountRange
    setting: DateSetting
    content: dict[str, IdeaContent]


class CatalogFile(_FileModel):
    """Root of a catalog file."""

    schema_version: Literal[1]
    catalog_version: Annotated[Text, Field(max_length=64)]
    edition: Literal["development", "editorial"]
    """``development`` marks a demonstration dataset, never the final catalog."""
    default_locale: Annotated[str, Field(pattern=LOCALE_PATTERN)]
    locales: Annotated[
        list[Annotated[str, Field(pattern=LOCALE_PATTERN)]], Field(min_length=1, max_length=16)
    ]
    currency: Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
    categories: Annotated[list[CatalogCategory], Field(min_length=1, max_length=64)]
    ideas: Annotated[list[CatalogIdea], Field(max_length=IDEAS_MAX)]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        problems = list(_consistency_problems(self))
        if problems:
            raise ValueError("; ".join(problems))
        return self


def _texts(content: IdeaContent) -> Iterable[str]:
    yield content.title
    yield content.description
    yield from content.requirements


def _consistency_problems(catalog: CatalogFile) -> Iterable[str]:
    locales = set(catalog.locales)
    if len(locales) != len(catalog.locales):
        yield "locales must be unique"
    if catalog.default_locale not in locales:
        yield "defaultLocale must be listed in locales"

    category_ids: set[str] = set()
    for category in catalog.categories:
        if category.id in category_ids:
            yield f"duplicate category id {category.id!r}"
        category_ids.add(category.id)
        if catalog.default_locale not in category.labels:
            yield f"category {category.id!r} lacks a {catalog.default_locale!r} label"
        for locale in sorted(set(category.labels) - locales):
            yield f"category {category.id!r} has a label for unlisted locale {locale!r}"

    idea_ids: set[str] = set()
    for idea in catalog.ideas:
        if idea.id in idea_ids:
            yield f"duplicate idea id {idea.id!r}"
        idea_ids.add(idea.id)
        if idea.category not in category_ids:
            yield f"idea {idea.id!r} uses unknown category {idea.category!r}"
        if catalog.default_locale not in idea.content:
            yield f"idea {idea.id!r} lacks {catalog.default_locale!r} content"
        for locale in sorted(set(idea.content) - locales):
            yield f"idea {idea.id!r} has content for unlisted locale {locale!r}"
        for locale, content in idea.content.items():
            for value in _texts(content):
                if unicodedata.normalize("NFC", value) != value:
                    yield f"idea {idea.id!r} ({locale}) contains non-NFC text"
                if any(unicodedata.category(char) == "Cc" for char in value):
                    yield f"idea {idea.id!r} ({locale}) contains control characters"


def removed_idea_ids(previous: CatalogFile, candidate: CatalogFile) -> list[str]:
    """IDs that ``candidate`` would drop. Permanent IDs must be retired instead."""
    kept = {idea.id for idea in candidate.ideas}
    return sorted(idea.id for idea in previous.ideas if idea.id not in kept)


def parse_catalog(raw: str | bytes) -> CatalogFile:
    """Parse and validate one catalog file; raises ``pydantic.ValidationError``."""
    return CatalogFile.model_validate(json.loads(raw))


def canonical_json(catalog: CatalogFile) -> str:
    """Stable serialization used when importing a catalog into the package."""
    data = catalog.model_dump(mode="json", by_alias=True)
    data["ideas"] = sorted(data["ideas"], key=lambda idea: (idea["sortKey"], idea["id"]))
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


# --- Resolved, read-only view ------------------------------------------------


@dataclass(frozen=True)
class ResolvedCategory:
    id: str
    label: str


@dataclass(frozen=True)
class ResolvedIdea:
    id: str
    category_id: str
    title: str
    description: str
    requirements: tuple[str, ...]
    content_locale: str
    duration_min_minutes: int
    duration_max_minutes: int
    duration_band: DurationBand
    budget_min: int
    budget_max: int
    budget_band: BudgetBand
    setting: DateSetting


@dataclass(frozen=True)
class IdeaFilter:
    category: str | None = None
    duration: DurationBand | None = None
    budget: BudgetBand | None = None
    setting: SettingFilter | None = None

    def matches(self, idea: ResolvedIdea) -> bool:
        if self.category is not None and idea.category_id != self.category:
            return False
        if self.duration is not None and idea.duration_band != self.duration:
            return False
        if self.budget is not None and idea.budget_band != self.budget:
            return False
        if self.setting is not None:
            return idea.setting in (DateSetting(self.setting.value), DateSetting.EITHER)
        return True


class DateIdeaCatalog:
    """Validated catalog with locale resolution and deterministic order."""

    def __init__(self, data: CatalogFile) -> None:
        self.data = data
        self._ideas = tuple(
            sorted(
                (idea for idea in data.ideas if idea.active),
                key=lambda idea: (idea.sort_key, idea.id),
            )
        )
        self._by_id = {idea.id: idea for idea in data.ideas}

    @property
    def version(self) -> str:
        return self.data.catalog_version

    @property
    def edition(self) -> str:
        return self.data.edition

    @property
    def currency(self) -> str:
        return self.data.currency

    def resolve_locale(self, requested: str | None) -> str:
        """Exact supported locale, then its language, then the default locale."""
        if requested:
            tag = requested.strip().replace("_", "-")
            by_lower = {locale.lower(): locale for locale in self.data.locales}
            if tag.lower() in by_lower:
                return by_lower[tag.lower()]
            language = tag.split("-", 1)[0].lower()
            if language in by_lower:
                return by_lower[language]
        return self.data.default_locale

    def categories(self, locale: str) -> list[ResolvedCategory]:
        """Categories that at least one active idea uses, in catalog order."""
        used = {idea.category for idea in self._ideas}
        return [
            ResolvedCategory(
                id=category.id,
                label=category.labels.get(locale, category.labels[self.data.default_locale]),
            )
            for category in self.data.categories
            if category.id in used
        ]

    def has_category(self, category_id: str) -> bool:
        return any(category.id == category_id for category in self.data.categories)

    def active_idea(self, idea_id: str, locale: str) -> ResolvedIdea | None:
        idea = self._by_id.get(idea_id)
        if idea is None or not idea.active:
            return None
        return self._resolve(idea, locale)

    def ideas(self, locale: str, idea_filter: IdeaFilter | None = None) -> list[ResolvedIdea]:
        resolved = (self._resolve(idea, locale) for idea in self._ideas)
        if idea_filter is None:
            return list(resolved)
        return [idea for idea in resolved if idea_filter.matches(idea)]

    def _resolve(self, idea: CatalogIdea, locale: str) -> ResolvedIdea:
        content_locale = locale if locale in idea.content else self.data.default_locale
        content = idea.content[content_locale]
        return ResolvedIdea(
            id=idea.id,
            category_id=idea.category,
            title=content.title,
            description=content.description,
            requirements=tuple(content.requirements),
            content_locale=content_locale,
            duration_min_minutes=idea.duration_minutes.min,
            duration_max_minutes=idea.duration_minutes.max,
            duration_band=duration_band(idea.duration_minutes.max),
            budget_min=idea.budget_for_two.min,
            budget_max=idea.budget_for_two.max,
            budget_band=budget_band(idea.budget_for_two.max),
            setting=idea.setting,
        )


CATALOG_RESOURCE = "data/catalog.json"


def bundled_catalog_text() -> str:
    return files("eimir.date_ideas").joinpath(CATALOG_RESOURCE).read_text(encoding="utf-8")


@cache
def get_catalog() -> DateIdeaCatalog:
    """The bundled catalog, validated once per process."""
    return DateIdeaCatalog(parse_catalog(bundled_catalog_text()))
