"""Time.

Two concepts that must not be conflated:

- An *instant* is a moment on the global timeline. It is kept in UTC and
  stored as TIMESTAMPTZ.
- A *domain day* is a calendar date without a time - a birthday, anniversary,
  or the day of an experience. It is stored as DATE.

A birthday has no timezone. Storing it as an instant will eventually shift it
by a day.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

log = logging.getLogger(__name__)


def now() -> datetime:
    """Return the current timezone-aware instant in UTC."""
    return datetime.now(UTC)


def ensure_utc(value: datetime) -> datetime:
    """Normalize an instant to UTC.

    A value without timezone information is interpreted as UTC. That is an
    assumption and is valid only because this project must not create naive
    timestamps; see the conventions in docs/ARCHITECTURE.md.
    """
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def today_utc() -> date:
    """Return today's calendar date in UTC.

    For technical use only. This is wrong for every user-visible day boundary
    - shared days, anniversaries, reminders - because those belong to the
    timezone of the person reading them. Use `today_in` for that.
    """
    return now().date()


def resolve_zone(name: str) -> ZoneInfo:
    """Resolve a named timezone, falling back to UTC.

    `Account.timezone` is persisted text. An unknown name must not turn a read
    request into a 500 response: relationship duration is display data rather
    than the purpose of the request. The fallback is logged so invalid data
    remains visible instead of becoming a silent miscalculation.
    """
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        log.warning("unknown timezone, falling back to UTC", extra={"timezone": name})
        return ZoneInfo("UTC")


def resolve_local(
    day: date,
    wall_time: time,
    zone: ZoneInfo,
    *,
    ambiguous: Literal["earlier", "later"] = "earlier",
) -> datetime:
    """Resolve a wall time to UTC, including daylight-saving transitions.

    Repeated times choose the earlier instant by default (the Reminder rule);
    a window's closing boundary can choose the later instant. Missing times
    shift forward by the daylight-saving gap, preserving the chosen minute.
    """
    naive = datetime.combine(day, wall_time.replace(tzinfo=None))
    first = naive.replace(tzinfo=zone, fold=0)
    second = naive.replace(tzinfo=zone, fold=1)
    valid_first = _roundtrips(first, naive, zone)
    valid_second = _roundtrips(second, naive, zone)

    if valid_first and valid_second:
        candidates = (first.astimezone(UTC), second.astimezone(UTC))
        return min(candidates) if ambiguous == "earlier" else max(candidates)
    if valid_first:
        return first.astimezone(UTC)
    if valid_second:
        return second.astimezone(UTC)

    before = (naive - timedelta(hours=3)).replace(tzinfo=zone).utcoffset()
    after = (naive + timedelta(hours=3)).replace(tzinfo=zone).utcoffset()
    if before is None or after is None or after <= before:
        raise ValueError("Unable to resolve nonexistent local time.")
    shifted = naive + (after - before)
    return shifted.replace(tzinfo=zone, fold=0).astimezone(UTC)


def _roundtrips(candidate: datetime, naive: datetime, zone: ZoneInfo) -> bool:
    return candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None) == naive


def today_in(zone: str, *, at: datetime | None = None) -> date:
    """Return today's calendar date in a specific timezone.

    A person's domain day changes at midnight where they are, not at midnight
    UTC. Otherwise somebody west of UTC could count up to one day too many,
    while somebody east of UTC could count one day too few, and an anniversary
    would shift by hours.
    """
    instant = at if at is not None else now()
    return ensure_utc(instant).astimezone(resolve_zone(zone)).date()


def annual_occurrence(year: int, month: int, day: int) -> date:
    """Resolve one year's occurrence of an annually-recurring month/day.

    February 29 resolves to February 28 in a non-leap year rather than
    raising or being skipped. This is the one canonical annual-recurrence
    rule for every domain day that repeats yearly - Reminder/Rule scheduling
    and the Dashboard upcoming projection both call this, so a leap-year
    source date (a birthday, anniversary, or important date) never disagrees
    with itself across surfaces.
    """
    try:
        return date(year, month, day)
    except ValueError:
        if month == 2 and day == 29:
            return date(year, 2, 28)
        raise
