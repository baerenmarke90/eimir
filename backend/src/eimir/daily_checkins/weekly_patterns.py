"""Descriptive observations over comparable, mutually visible daily values only."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from statistics import mean

from eimir.daily_checkins.insights import DailyInsightDayEntry, DailyInsightsResult
from eimir.daily_checkins.models import RecommendationKey
from eimir.daily_checkins.service import PartnerRevealState


class ObservationKind(StrEnum):
    JOINT_DAYS = "JOINT_DAYS"
    ENERGY_RISING = "ENERGY_RISING"
    ENERGY_FALLING = "ENERGY_FALLING"
    WEEKEND_HIGHER = "WEEKEND_HIGHER"
    WEEKEND_LOWER = "WEEKEND_LOWER"
    WEEKDAY_LOWER = "WEEKDAY_LOWER"
    DIFFERENT_VIBES = "DIFFERENT_VIBES"


@dataclass(frozen=True)
class Observation:
    key: str
    kind: ObservationKind
    sample_count: int
    value: int | None = None
    weekday: int | None = None


def paired_energy(day: DailyInsightDayEntry) -> tuple[int, int] | None:
    partner = day.partner_energy
    if day.own_energy is None or partner is None or partner.state != PartnerRevealState.VISIBLE:
        return None
    if not isinstance(partner.value, int):
        return None
    return day.own_energy, partner.value


def paired_vibes(day: DailyInsightDayEntry) -> tuple[str, str] | None:
    partner = day.partner_vibe
    if day.own_vibe is None or partner is None or partner.state != PartnerRevealState.VISIBLE:
        return None
    if not isinstance(partner.value, str):
        return None
    return day.own_vibe, partner.value


def _weeks(days: list[DailyInsightDayEntry]) -> int:
    return len({day.checked_on - timedelta(days=day.checked_on.weekday()) for day in days})


def _difference(
    left: list[DailyInsightDayEntry], right: list[DailyInsightDayEntry]
) -> tuple[float, float]:
    a = [value for day in left if (value := paired_energy(day)) is not None]
    b = [value for day in right if (value := paired_energy(day)) is not None]
    return mean(x[0] for x in a) - mean(x[0] for x in b), mean(x[1] for x in a) - mean(
        x[1] for x in b
    )


def observations(result: DailyInsightsResult, week_start: date) -> list[Observation]:
    days = result.days
    current = [d for d in days if week_start <= d.checked_on <= week_start + timedelta(days=6)]
    joint = sum(paired_energy(d) is not None or paired_vibes(d) is not None for d in current)
    facts = (
        [Observation("joint_days", ObservationKind.JOINT_DAYS, joint, value=joint)] if joint else []
    )
    energies = [d for d in days if paired_energy(d) is not None]
    this_energy = [d for d in energies if d.checked_on >= week_start]
    last_energy = [
        d for d in energies if week_start - timedelta(days=7) <= d.checked_on < week_start
    ]
    if len(this_energy) >= 3 and len(last_energy) >= 3:
        delta = _difference(this_energy, last_energy)
        if min(delta) >= 10:
            facts.append(
                Observation(
                    "energy_rising",
                    ObservationKind.ENERGY_RISING,
                    len(this_energy) + len(last_energy),
                )
            )
        elif max(delta) <= -10:
            facts.append(
                Observation(
                    "energy_falling",
                    ObservationKind.ENERGY_FALLING,
                    len(this_energy) + len(last_energy),
                )
            )
    weekend = [d for d in energies if d.checked_on.weekday() >= 5]
    workdays = [d for d in energies if d.checked_on.weekday() < 5]
    if len(weekend) >= 6 and len(workdays) >= 6 and _weeks(weekend) >= 3 and _weeks(workdays) >= 3:
        delta = _difference(weekend, workdays)
        if min(delta) >= 10:
            facts.append(
                Observation("weekend_higher", ObservationKind.WEEKEND_HIGHER, len(energies))
            )
        elif max(delta) <= -10:
            facts.append(Observation("weekend_lower", ObservationKind.WEEKEND_LOWER, len(energies)))
    weekday_candidates: list[tuple[float, int, int]] = []
    for weekday in range(7):
        group = [d for d in energies if d.checked_on.weekday() == weekday]
        other = [d for d in energies if d.checked_on.weekday() != weekday]
        if len(group) >= 4 and len(other) >= 8 and _weeks(group) >= 4:
            delta = _difference(other, group)
            if min(delta) >= 10:
                weekday_candidates.append((sum(delta), weekday, len(group)))
    if weekday_candidates:
        _, weekday, count = max(weekday_candidates, key=lambda item: (item[0], -item[1]))
        facts.append(
            Observation("weekday_lower", ObservationKind.WEEKDAY_LOWER, count, weekday=weekday)
        )
    vibes = [d for d in days if paired_vibes(d) is not None]
    different = [d for d in vibes if (pair := paired_vibes(d)) is not None and pair[0] != pair[1]]
    if len(different) >= 3 and _weeks(different) >= 3:
        facts.append(
            Observation(
                "different_vibes", ObservationKind.DIFFERENT_VIBES, len(vibes), value=len(different)
            )
        )
    return facts


def recommendation_order(facts: list[Observation]) -> list[RecommendationKey]:
    kinds = {fact.kind for fact in facts}
    preferred: list[RecommendationKey] = []
    if kinds & {ObservationKind.ENERGY_FALLING, ObservationKind.WEEKDAY_LOWER}:
        preferred.append(RecommendationKey.QUIET_TIME)
    if ObservationKind.DIFFERENT_VIBES in kinds:
        preferred.append(RecommendationKey.OWN_PACE)
    if kinds & {ObservationKind.ENERGY_RISING, ObservationKind.WEEKEND_HIGHER}:
        preferred.append(RecommendationKey.SMALL_PLAN)
    return list(dict.fromkeys([*preferred, *RecommendationKey]))
