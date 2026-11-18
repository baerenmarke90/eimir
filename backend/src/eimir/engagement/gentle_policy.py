"""Bounded, deterministic own-use policy; no content or provider dependencies."""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from itertools import pairwise
from statistics import median
from typing import TypedDict

from eimir.core import clock
from eimir.engagement.quiet_hours import QuietHoursWindow

MAX_ACTIVE_DAYS = 8
OBSERVATION_DAYS = 90
MIN_ACTIVE_DAYS = 3
MIN_WINDOW_DAYS = 3
WINDOW_HOURS = 3
PROFILE_RETENTION = timedelta(days=120)
ROLLING_BUDGET = timedelta(days=7)
BACKOFF = (timedelta(days=14), timedelta(days=28))
MAX_UNOBSERVED_ATTEMPTS = 3
PARTNER_ATTENTION_PAUSE = timedelta(hours=24)
VIEW_SUPPRESSION = timedelta(days=30)
SOURCE_REPEAT_PAUSE = timedelta(days=90)
FOREGROUND_COALESCE = timedelta(minutes=15)


class DayObservation(TypedDict):
    day: str
    windows: list[int]
    memory_read: bool


@dataclass(frozen=True)
class Rhythm:
    interval_days: float | None
    windows: tuple[int, ...]


def observe(
    observations: list[DayObservation], *, at: datetime, timezone: str, memory_read: bool = False
) -> list[DayObservation]:
    local = clock.ensure_utc(at).astimezone(clock.resolve_zone(timezone))
    day = local.date()
    window = local.hour // WINDOW_HOURS
    recent: list[DayObservation] = [
        {"day": item["day"], "windows": list(item["windows"]), "memory_read": item["memory_read"]}
        for item in observations
        if day - timedelta(days=OBSERVATION_DAYS) <= date.fromisoformat(item["day"]) <= day
    ]
    current = next((item for item in recent if item["day"] == day.isoformat()), None)
    if current is None:
        current = {"day": day.isoformat(), "windows": [], "memory_read": False}
        recent.append(current)
    current["windows"] = [w for w in current["windows"] if w != window] + [window]
    current["memory_read"] = current["memory_read"] or memory_read
    return sorted(recent, key=lambda item: item["day"])[-MAX_ACTIVE_DAYS:]


def learn(observations: list[DayObservation]) -> Rhythm:
    days = sorted({date.fromisoformat(item["day"]) for item in observations})
    gaps = [(right - left).days for left, right in pairwise(days)]
    interval = float(median(gaps)) if len(days) >= MIN_ACTIVE_DAYS else None
    support = Counter(window for item in observations for window in set(item["windows"]))
    # Input is chronological; the final occurrence is the most recent supporting use.
    recency = {
        window: (item["day"], position)
        for item in observations
        for position, window in enumerate(item["windows"])
    }
    # Descending recency within equally supported windows, with a stable final tie.
    windows = tuple(
        sorted(
            (window for window, count in support.items() if count >= MIN_WINDOW_DAYS),
            key=lambda window: (support[window], recency[window], -window),
            reverse=True,
        )
    )
    return Rhythm(interval, windows)


def eligible_after(
    *,
    last_use_at: datetime | None,
    interval_days: float | None,
    attempts_since_use: int,
    last_attempt_at: datetime | None,
    at: datetime,
) -> datetime | None:
    if (
        last_use_at is None
        or interval_days is None
        or attempts_since_use >= MAX_UNOBSERVED_ATTEMPTS
        or at >= last_use_at + PROFILE_RETENTION
    ):
        return None
    threshold = last_use_at + max(ROLLING_BUDGET, timedelta(days=2 * interval_days))
    if last_attempt_at is not None:
        threshold = max(threshold, last_attempt_at + ROLLING_BUDGET)
        if attempts_since_use:
            threshold = max(threshold, last_attempt_at + BACKOFF[attempts_since_use - 1])
    return threshold


def delivery_window(
    *, at: datetime, timezone: str, windows: tuple[int, ...], quiet_hours: QuietHoursWindow | None
) -> tuple[datetime, datetime] | None:
    """Return only the currently learned window; never move a missed occasion."""
    instant = clock.ensure_utc(at)
    zone = clock.resolve_zone(timezone)
    local = instant.astimezone(zone)
    for window in windows:
        start = clock.resolve_local(local.date(), time(window * WINDOW_HOURS), zone)
        end_wall = (window + 1) * WINDOW_HOURS
        end = clock.resolve_local(
            local.date() + timedelta(days=end_wall // 24),
            time(end_wall % 24),
            zone,
            ambiguous="later",
        )
        release = quiet_hours.release_at(start, timezone) if quiet_hours is not None else None
        if release is not None and release >= end:
            continue
        # Prefer the strongest eligible window even if a weaker one is earlier.
        if not start <= instant < end:
            return None
        if quiet_hours is not None and quiet_hours.release_at(instant, timezone) is not None:
            return None
        # Null Account boundaries are the established explicit/default OFF policy.
        return start, end
    return None
