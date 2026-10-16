"""Shared time.

Pure calendar arithmetic on a DATE: no instant and no timezone. The start of
a relationship is a calendar day.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class Duration:
    days: int
    years: int
    months: int


def since(started_on: date, today: date) -> Duration | None:
    """Return elapsed time, or None when the start lies in the future.

    A future date does not produce shared time. Returning negative values
    would be worse than returning nothing because a UI could turn that into
    wording such as "together for -3 days".
    """
    if started_on > today:
        return None

    days = (today - started_on).days

    years = today.year - started_on.year
    months = today.month - started_on.month
    if today.day < started_on.day:
        months -= 1
    if months < 0:
        years -= 1
        months += 12

    return Duration(days=days, years=years, months=months)
