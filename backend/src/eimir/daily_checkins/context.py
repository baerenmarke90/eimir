"""Authoritative Space-day resolution for Daily Check-in runtime."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from eimir.core.clock import ensure_utc, now
from eimir.core.errors import ConflictError, ValidationError
from eimir.identity.preferences import validate_timezone


class DailyCheckInErrorCode:
    CONTEXT_UNAVAILABLE = "DAILY_CHECK_IN_CONTEXT_UNAVAILABLE"
    ENERGY_LEVEL_INVALID = "DAILY_CHECK_IN_ENERGY_LEVEL_INVALID"
    VIBE_NOTE_REQUIRES_VIBE = "DAILY_CHECK_IN_VIBE_NOTE_REQUIRES_VIBE"


def resolve_space_day(
    timezone_name: str | None,
    *,
    at: datetime | None = None,
) -> date:
    """Return the server-authoritative calendar day for one Space.

    Daily Check-in deliberately does not use ``clock.today_in`` because that
    helper is presentation-oriented and falls back to UTC for corrupt legacy
    account preferences. Here a missing or invalid shared timezone must fail
    closed: silently moving the relationship day to UTC would change reveal and
    retention semantics.
    """
    if timezone_name is None:
        raise ConflictError(
            "Daily Check-in requires a valid shared Space time zone.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        )

    try:
        validated = validate_timezone(timezone_name)
        zone = ZoneInfo(validated)
    except (ValidationError, ZoneInfoNotFoundError, ValueError) as invalid:
        raise ConflictError(
            "Daily Check-in requires a valid shared Space time zone.",
            DailyCheckInErrorCode.CONTEXT_UNAVAILABLE,
        ) from invalid

    instant = at if at is not None else now()
    return ensure_utc(instant).astimezone(zone).date()
