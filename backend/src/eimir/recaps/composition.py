"""Deterministic calendar and diversity rules, independent of model availability."""

from __future__ import annotations

import calendar
import hashlib
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from eimir.recaps.models import RecapKind, RecapSourceKind


@dataclass(frozen=True)
class Candidate:
    kind: RecapSourceKind
    id: UUID
    occurred_on: date
    version: int
    group: str | None = None

    @property
    def key(self) -> str:
        return f"{self.kind}:{self.id}"


def period_bounds(kind: RecapKind, year: int, month: int, today: date) -> tuple[date, date, bool]:
    if (
        not 1900 <= year <= today.year
        or (kind == RecapKind.MONTH and not 1 <= month <= 12)
        or (kind == RecapKind.YEAR and month != 0)
    ):
        raise ValueError("Invalid recap period.")
    first = date(year, month if kind == RecapKind.MONTH else 1, 1)
    last_month = month if kind == RecapKind.MONTH else 12
    last = date(year, last_month, calendar.monthrange(year, last_month)[1])
    if first > today:
        raise ValueError("Future periods cannot be generated.")
    return first, min(last, today), today <= last


def select_candidates(
    candidates: list[Candidate], kind: RecapKind, seed: str, variant: int
) -> list[Candidate]:
    """Time/kind diversity wins over event volume; variants are stable per period."""
    limit = 3 if kind == RecapKind.MONTH else 8
    selected: list[Candidate] = []
    remaining = {item.key: item for item in candidates}
    if variant and len(remaining) > limit:
        baseline = select_candidates(candidates, kind, seed, 0)
        # A requested alternative must differ even when every kind has one item.
        remaining.pop(baseline[(variant - 1) % len(baseline)].key)
    weights = {"MILESTONE": 12, "CHAPTER": 10, "PLAN": 6, "HEART_MOMENT": 5, "MEMORY": 4}
    while remaining and len(selected) < limit:

        def priority(item: Candidate) -> tuple[int, str]:
            same_month = sum(
                value.occurred_on.month == item.occurred_on.month for value in selected
            )
            same_kind = sum(value.kind == item.kind for value in selected)
            same_group = sum(bool(item.group) and value.group == item.group for value in selected)
            score = weights[item.kind] - same_kind * 8 - same_group * 16
            if kind == RecapKind.YEAR:
                score -= same_month * 24
            tie = hashlib.sha256(f"{seed}:{variant}:{item.key}".encode()).hexdigest()
            return score, tie

        chosen = max(remaining.values(), key=priority)
        selected.append(chosen)
        del remaining[chosen.key]
    return sorted(selected, key=lambda value: (value.occurred_on, value.kind, str(value.id)))


def theme_for(candidates: list[Candidate]) -> str:
    kinds = {item.kind for item in candidates}
    if RecapSourceKind.MILESTONE in kinds:
        return "MILESTONES"
    if RecapSourceKind.CHAPTER in kinds:
        return "CHAPTERS"
    if RecapSourceKind.PLAN in kinds:
        return "PLANS"
    if RecapSourceKind.HEART_MOMENT in kinds:
        return "WORDS"
    return "MOMENTS"
