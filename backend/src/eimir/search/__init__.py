"""M4-A authorization-first global Search read model."""

from eimir.search.service import (
    DEFAULT_LIMIT,
    MAX_LIMIT,
    SearchKind,
    SearchPageResult,
    SearchRow,
    SearchScope,
    normalize_query,
    search,
)

__all__ = [
    "DEFAULT_LIMIT",
    "MAX_LIMIT",
    "SearchKind",
    "SearchPageResult",
    "SearchRow",
    "SearchScope",
    "normalize_query",
    "search",
]
