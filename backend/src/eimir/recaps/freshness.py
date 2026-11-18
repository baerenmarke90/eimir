"""Late-entry detection for composed recaps (#1744).

Every composed edition records a fingerprint of the shared material it
accounted for. The background scan compares it with the current material of
each period in one grouped query, so a back-filled, moved, edited, withdrawn
or imported entry is noticed however far back its date lies. A change is acted
on only once the period has been quiet for ``QUIET``: a burst of back-filled
entries costs one recomposition, not one per entry.

An open (unretained) proposal is recomposed silently. A retained edition stays
as it is; a new version is composed with the frozen look and kept only when
the late material is significant (``significant``). A curated selection is
never touched.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from enum import StrEnum
from hashlib import md5
from typing import Any
from uuid import UUID

from sqlalchemy import String, cast, func, literal_column, select
from sqlalchemy.dialects.postgresql import aggregate_order_by
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.recaps.models import RecapKind, RecapSourceKind

# A period must be free of changes this long before it is recomposed.
QUIET = timedelta(hours=2)
# Late moments that make a new version worthwhile when none becomes the highlight.
LATE_MOMENTS = 3
# The digest of a period without any shared material.
EMPTY = ""

Period = tuple[str, int, int]


class Step(StrEnum):
    FRESH = "FRESH"
    """The edition accounts for the current material."""
    WAIT = "WAIT"
    """The material changed recently; remember it and wait for quiet."""
    ACT = "ACT"
    """The material changed and the period has been quiet: recompose or weigh a version."""
    BASELINE = "BASELINE"
    """A retained edition composed before fingerprints existed adopts the current state."""


@dataclass(frozen=True)
class Observation:
    step: Step
    observed_digest: str | None
    observed_at: datetime | None


def observe(
    accounted: str | None,
    observed: str | None,
    observed_at: datetime | None,
    current: str,
    now: datetime,
    *,
    retained: bool,
) -> Observation:
    """Decide what a scan does with one edition; pure and clock-explicit."""
    if accounted is None:
        # Unknown composition state: an open proposal is simply recomposed, while
        # a retained edition is never reweighed against changes it cannot date.
        return Observation(Step.BASELINE if retained else Step.ACT, None, None)
    if current == accounted:
        return Observation(Step.FRESH, None, None)
    if current != observed or observed_at is None:
        # A new change restarts the quiet period.
        return Observation(Step.WAIT, current, now)
    if now - clock.ensure_utc(observed_at) >= QUIET:
        return Observation(Step.ACT, observed, observed_at)
    return Observation(Step.WAIT, observed, observed_at)


def late_moments(previous: Iterable[str], selected: Iterable[str], changed: set[str]) -> list[str]:
    """Selected moments that were not in the retained film and changed after it."""
    known = set(previous)
    return [key for key in selected if key not in known and key in changed]


def significant(late: list[str], highlight: str | None) -> bool:
    """A new version is kept when a late moment leads the film or several join it."""
    return bool(late) and (highlight in late or len(late) >= LATE_MOMENTS)


def digest(entries: Iterable[str]) -> str:
    joined = "|".join(entries)
    return md5(joined.encode(), usedforsecurity=False).hexdigest() if joined else EMPTY


def fingerprints(session: Session, context: AuthorizationContext) -> dict[Period, str]:
    """Current material digest of every month and year with shared material.

    It covers exactly the sources a film draws from (shared, readable,
    starting in the period) and their versions, so any create, edit, move,
    withdrawal or deletion changes the digest of the affected periods.
    """
    from eimir.recaps.service import _metadata

    source = _metadata(context)
    year = func.extract("year", source.c.day)
    month = func.extract("month", source.c.day)
    entry = (
        cast(source.c.kind, String)
        + literal_column("':'")
        + cast(source.c.id, String)
        + literal_column("':'")
        + cast(source.c.version, String)
    )
    rows = session.execute(
        select(
            year.label("year"),
            month.label("month"),
            func.md5(
                func.string_agg(
                    entry, aggregate_order_by(literal_column("','"), source.c.kind, source.c.id)
                )
            ).label("digest"),
        )
        .where(source.c.day >= date(1900, 1, 1), source.c.day < date(2101, 1, 1))
        .group_by(year, month)
    ).all()
    months: dict[int, list[str]] = {}
    result: dict[Period, str] = {}
    for row in rows:
        value_year, value_month = int(row.year), int(row.month)
        result[(RecapKind.MONTH.value, value_year, value_month)] = row.digest
        months.setdefault(value_year, []).append(f"{value_month}:{row.digest}")
    for value_year, parts in months.items():
        result[(RecapKind.YEAR.value, value_year, 0)] = digest(sorted(parts))
    return result


def period_digest(
    session: Session, context: AuthorizationContext, kind: str, year: int, month: int
) -> str:
    return fingerprints(session, context).get((kind, year, month), EMPTY)


def changed_since(
    session: Session, context: AuthorizationContext, keys: Iterable[str], since: datetime
) -> set[str]:
    """Keys of the given sources created or changed after ``since`` (database time)."""
    from eimir.recaps.service import MODELS

    wanted: dict[RecapSourceKind, set[UUID]] = {}
    for key in keys:
        kind, _, raw = key.partition(":")
        wanted.setdefault(RecapSourceKind(kind), set()).add(UUID(raw))
    result: set[str] = set()
    for kind, ids in wanted.items():
        model: Any = MODELS[kind]
        for source_id in session.scalars(
            select(model.id).where(
                model.id.in_(ids),
                model.space_id == context.space_id,
                model.updated_at > since,
            )
        ):
            result.add(f"{kind.value}:{source_id}")
    return result
