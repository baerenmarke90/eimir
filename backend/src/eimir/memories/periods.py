"""Inclusive calendar periods shared by Memory reads and writes."""

from datetime import date

from eimir.core.errors import ValidationError


def validate_period(start: date | None, end: date | None) -> None:
    if end is not None and (start is None or end < start):
        raise ValidationError(
            "A memory period requires a start and an end on or after it.",
            "MEMORY_PERIOD_INVALID",
        )


def merged_intervals(values: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """Coalesce before expanding calendar indexes, so overlapping long trips stay bounded."""
    result: list[tuple[int, int]] = []
    for first, last in sorted(values):
        if first > last:
            continue
        if result and first <= result[-1][1] + 1:
            result[-1] = (result[-1][0], max(last, result[-1][1]))
        else:
            result.append((first, last))
    return result
