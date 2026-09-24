"""Pure, recipient-local quiet-hours time calculation.

Delivery policy decides which notification kinds to defer; this module only
resolves the local window containing an instant, without enqueueing delivery.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta

from eimir.core import clock


@dataclass(frozen=True)
class QuietHoursWindow:
    """A daily half-open interval [start, end) in the recipient's timezone."""

    start: time
    end: time

    def __post_init__(self) -> None:
        for boundary in (self.start, self.end):
            if boundary.tzinfo is not None or boundary.second or boundary.microsecond:
                raise ValueError("Quiet-hours boundaries must be naive and minute-precise.")
        if self.start == self.end:
            raise ValueError("Quiet-hours start and end must differ.")

    def release_at(self, at: datetime, timezone_name: str) -> datetime | None:
        """Return the UTC end of the active window, or None outside it.

        Starts in an autumn overlap use the earlier occurrence and ends the
        later one. A spring gap shifts the boundary forward by the DST gap,
        just as Reminder wall times do. Overnight windows start yesterday or
        today relative to the recipient's current local date.
        """
        instant = clock.ensure_utc(at)
        zone = clock.resolve_zone(timezone_name)
        local_day = instant.astimezone(zone).date()
        overnight = self.end < self.start

        for start_day in (local_day - timedelta(days=1), local_day):
            if start_day != local_day and not overnight:
                continue
            end_day = start_day + timedelta(days=1) if overnight else start_day
            start_at = clock.resolve_local(start_day, self.start, zone)
            end_at = clock.resolve_local(end_day, self.end, zone, ambiguous="later")
            if start_at <= instant < end_at:
                return end_at
        return None
