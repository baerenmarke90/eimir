"""Private ("just me") weekly brief over the caller's own values (#2197).

Plugin code (``daily.insights``, Decision 0017), model-free. Only the caller's
own Daily Check-in rows are read; partner rows are never queried, so no
Mutual Reveal projection is involved and nothing here can describe the
partner. Shared Plan/Memory dates come through ``readable()``.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from statistics import mean
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core.errors import ValidationError as DomainValidationError
from eimir.daily_checkins.models import DailyCheckIn
from eimir.memories.experiences import roots_only
from eimir.memories.models import Memory
from eimir_pro.daily_insights import insights
from eimir_pro.daily_insights.weekly_brief import GOOD_VIBES, HISTORY_WEEKS, plan_days

MIN_OWN_DAYS = 3
MIN_GROUP_DAYS = 3
MIN_GROUP_WEEKS = 2
MIN_WEEKDAY_DAYS = 4
MIN_WEEKDAY_WEEKS = 4
MIN_OTHER_DAYS = 8
MIN_DIFFERENCE = 10


class PersonalBriefHeadline(StrEnum):
    EMPTY = "EMPTY"
    SPARSE = "SPARSE"
    WEEKDAY_LOWER = "WEEKDAY_LOWER"
    SHARED_HIGHER = "SHARED_HIGHER"
    GOOD_DAYS = "GOOD_DAYS"
    STEADY = "STEADY"


@dataclass(frozen=True)
class EnergyComparison:
    """Mean own Energy of one group against the rest, both rounded."""

    group: int
    others: int
    sample_days: int


@dataclass(frozen=True)
class WeekdayPattern:
    weekday: int
    energy: int
    others: int
    sample_days: int


@dataclass(frozen=True)
class PersonalBrief:
    week_start: date
    week_end: date
    elapsed_days: int
    own_days: list[date]
    good_days: list[date]
    shared_days: list[date]
    headline: PersonalBriefHeadline
    shared_energy: EnergyComparison | None
    lower_weekday: WeekdayPattern | None
    higher_weekday: WeekdayPattern | None


def _monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def build_personal(
    session: Session, context: AuthorizationContext, week_start: date
) -> PersonalBrief:
    anchor = insights.get_daily_insights(session, context)
    today = anchor.end_date
    if week_start.weekday() != 0 or week_start > today:
        raise DomainValidationError(
            "week_start must be a current or earlier Monday.", "VALIDATION_FAILED"
        )
    week_end = week_start + timedelta(days=6)
    last_day = min(week_end, today)
    history_start = week_start - timedelta(weeks=HISTORY_WEEKS - 1)
    zone = ZoneInfo(anchor.daily_context_timezone)

    rows = session.execute(
        select(DailyCheckIn).where(
            DailyCheckIn.space_id == context.space_id,
            DailyCheckIn.account_id == context.account_id,
            DailyCheckIn.checked_on.between(history_start, last_day),
        )
    ).scalars()
    vibes: dict[date, str] = {}
    energies: dict[date, int] = {}
    for row in rows:
        if anchor.vibe_enabled and row.vibe is not None:
            vibes[row.checked_on] = row.vibe
        if anchor.energy_enabled and row.energy_level is not None:
            energies[row.checked_on] = row.energy_level

    shared = plan_days(session, context, history_start, last_day, zone)
    shared |= _memory_days(session, context, history_start, last_day)

    elapsed = (last_day - week_start).days + 1
    week = [week_start + timedelta(days=offset) for offset in range(elapsed)]
    own_days = [day for day in week if day in vibes or day in energies]
    good_days = [day for day in week if vibes.get(day) in GOOD_VIBES]
    shared_energy = _shared_energy(energies, shared)
    lower, higher = _weekday_patterns(energies)
    return PersonalBrief(
        week_start=week_start,
        week_end=week_end,
        elapsed_days=elapsed,
        own_days=own_days,
        good_days=good_days,
        shared_days=sorted(day for day in shared if week_start <= day <= last_day),
        headline=_headline(own_days, good_days, shared_energy, lower),
        shared_energy=shared_energy,
        lower_weekday=lower,
        higher_weekday=higher,
    )


def _memory_days(
    session: Session, context: AuthorizationContext, start: date, end: date
) -> set[date]:
    statement = (
        readable(Memory, context)
        .where(roots_only(), Memory.happened_on >= start, Memory.happened_on <= end)
        .with_only_columns(Memory.happened_on)
        .distinct()
    )
    return {day for day in session.execute(statement).scalars() if day is not None}


def _weeks(days: list[date]) -> int:
    return len({_monday(day) for day in days})


def _shared_energy(energies: dict[date, int], shared: set[date]) -> EnergyComparison | None:
    with_shared = [day for day in energies if day in shared]
    without = [day for day in energies if day not in shared]
    if (
        len(with_shared) < MIN_GROUP_DAYS
        or len(without) < MIN_GROUP_DAYS
        or _weeks(with_shared) < MIN_GROUP_WEEKS
        or _weeks(without) < MIN_GROUP_WEEKS
    ):
        return None
    group = round(mean(energies[day] for day in with_shared))
    others = round(mean(energies[day] for day in without))
    if abs(group - others) < MIN_DIFFERENCE:
        return None
    return EnergyComparison(group=group, others=others, sample_days=len(energies))


def _weekday_patterns(
    energies: dict[date, int],
) -> tuple[WeekdayPattern | None, WeekdayPattern | None]:
    by_weekday: dict[int, list[date]] = defaultdict(list)
    for day in energies:
        by_weekday[day.weekday()].append(day)
    candidates: list[WeekdayPattern] = []
    for weekday, days in by_weekday.items():
        others = [day for day in energies if day.weekday() != weekday]
        if (
            len(days) < MIN_WEEKDAY_DAYS
            or _weeks(days) < MIN_WEEKDAY_WEEKS
            or len(others) < MIN_OTHER_DAYS
        ):
            continue
        candidates.append(
            WeekdayPattern(
                weekday=weekday,
                energy=round(mean(energies[day] for day in days)),
                others=round(mean(energies[day] for day in others)),
                sample_days=len(energies),
            )
        )
    lower = [c for c in candidates if c.others - c.energy >= MIN_DIFFERENCE]
    higher = [c for c in candidates if c.energy - c.others >= MIN_DIFFERENCE]
    pick_lower = min(lower, key=lambda c: (c.energy - c.others, c.weekday), default=None)
    pick_higher = max(higher, key=lambda c: (c.energy - c.others, -c.weekday), default=None)
    return pick_lower, pick_higher


def _headline(
    own_days: list[date],
    good_days: list[date],
    shared_energy: EnergyComparison | None,
    lower: WeekdayPattern | None,
) -> PersonalBriefHeadline:
    if not own_days:
        return PersonalBriefHeadline.EMPTY
    if len(own_days) < MIN_OWN_DAYS:
        return PersonalBriefHeadline.SPARSE
    if lower is not None:
        return PersonalBriefHeadline.WEEKDAY_LOWER
    if shared_energy is not None and shared_energy.group > shared_energy.others:
        return PersonalBriefHeadline.SHARED_HIGHER
    if good_days:
        return PersonalBriefHeadline.GOOD_DAYS
    return PersonalBriefHeadline.STEADY
