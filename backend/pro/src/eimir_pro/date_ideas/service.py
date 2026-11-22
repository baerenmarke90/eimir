"""Date inspiration catalog reads (Pro capability ``planning.date_inspiration``).

The router enforces the capability before anything here runs. Adopting an idea
happens on the client through the existing Wish and Plan composers and their
ordinary, Free endpoints, so this module never writes and keeps no state: no
click, choice or rejection is recorded, and no Space content is read.
"""

from __future__ import annotations

from dataclasses import dataclass

from eimir_pro.date_ideas.catalog import (
    DateIdeaCatalog,
    IdeaFilter,
    ResolvedIdea,
    ResolvedLabel,
    get_catalog,
)


@dataclass(frozen=True)
class DateIdeaListing:
    catalog: DateIdeaCatalog
    locale: str
    categories: list[ResolvedLabel]
    place_types: list[ResolvedLabel]
    ideas: list[ResolvedIdea]
    total_count: int


def list_date_ideas(*, locale: str | None, idea_filter: IdeaFilter) -> DateIdeaListing:
    catalog = get_catalog()
    resolved_locale = catalog.resolve_locale(locale)
    return DateIdeaListing(
        catalog=catalog,
        locale=resolved_locale,
        categories=catalog.categories(resolved_locale),
        place_types=catalog.place_types(resolved_locale),
        ideas=catalog.ideas(resolved_locale, idea_filter),
        total_count=len(catalog.data.ideas),
    )
