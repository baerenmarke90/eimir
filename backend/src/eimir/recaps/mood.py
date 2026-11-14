"""Rhythm of good days both partners shared, frozen into an edition.

Only days on which both active members have a Vibe count. Such a day is visible
to both under IMMEDIATE and under MUTUAL_REVEAL, so the aggregate discloses
nothing a reader could not already see, and it does not depend on who reads it.
Vibe is categorical: nothing is ranked, averaged or compared, difficult states
are not surfaced, and a one-sided day is never counted or implied.
"""

from __future__ import annotations

from collections import Counter
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.daily_checkins.models import DailyCheckIn
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability
from eimir.recaps.models import MoodBucket, MoodRhythm, RecapKind, RecapPayload
from eimir.relationship import configuration as configuration_service
from eimir.relationship.models import Membership, MembershipStatus

GOOD_VIBES = frozenset({"VERY_GOOD", "GOOD"})
MONTH_MINIMUM_DAYS = 5
YEAR_MINIMUM_DAYS = 20
YEAR_MINIMUM_MONTHS = 4
CAPABILITY = Capability.DAILY_INSIGHTS.value


def _partners(session: Session, space_id: UUID) -> tuple[UUID, UUID] | None:
    members = list(
        session.scalars(
            select(Membership.account_id).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    )
    return (members[0], members[1]) if len(members) == 2 else None


def _vibe_enabled(session: Session, space_id: UUID) -> bool:
    configuration = configuration_service.load(session, space_id)
    return bool(configuration and configuration.vibe_check_enabled)


def _bucket(kind: RecapKind, day: date) -> int:
    return (day.day - 1) // 7 + 1 if kind == RecapKind.MONTH else day.month


def compute(
    session: Session, space_id: UUID, kind: RecapKind, starts_on: date, through_on: date
) -> MoodRhythm | None:
    """The period's rhythm, or None when there is too little mutual material."""
    partners = _partners(session, space_id)
    if partners is None or not _vibe_enabled(session, space_id):
        return None
    rows = session.execute(
        select(DailyCheckIn.checked_on, DailyCheckIn.account_id, DailyCheckIn.vibe).where(
            DailyCheckIn.space_id == space_id,
            DailyCheckIn.account_id.in_(partners),
            DailyCheckIn.checked_on.between(starts_on, through_on),
            DailyCheckIn.vibe.is_not(None),
        )
    ).all()
    by_day: dict[date, dict[UUID, str]] = {}
    for day, account_id, vibe in rows:
        by_day.setdefault(day, {})[account_id] = vibe
    return rhythm(kind, starts_on, through_on, by_day)


def rhythm(
    kind: RecapKind, starts_on: date, through_on: date, by_day: dict[date, dict[UUID, str]]
) -> MoodRhythm | None:
    """Pure aggregation over each day's Vibe per partner; one-sided days are ignored."""
    mutual = {day: vibes for day, vibes in by_day.items() if len(vibes) == 2}
    months = {day.month for day in mutual}
    if kind == RecapKind.MONTH:
        enough = len(mutual) >= MONTH_MINIMUM_DAYS
    else:
        enough = len(mutual) >= YEAR_MINIMUM_DAYS and len(months) >= YEAR_MINIMUM_MONTHS
    if not enough:
        return None
    totals: Counter[int] = Counter()
    good: Counter[int] = Counter()
    for day, vibes in mutual.items():
        index = _bucket(kind, day)
        totals[index] += 1
        if all(vibe in GOOD_VIBES for vibe in vibes.values()):
            good[index] += 1
    first, last = _bucket(kind, starts_on), _bucket(kind, through_on)
    buckets = [
        MoodBucket(index=index, mutual_days=totals[index], good_days=good[index])
        for index in range(first, last + 1)
    ]
    ranked = good.most_common(2)
    # A tie or a single day is not a meaningful leading bucket.
    leading = (
        ranked[0][0]
        if ranked and ranked[0][1] > 1 and (len(ranked) == 1 or ranked[0][1] > ranked[1][1])
        else None
    )
    return MoodRhythm(buckets=buckets, leading=leading)


def refreshed(
    session: Session,
    space_id: UUID,
    kind: RecapKind,
    starts_on: date,
    through_on: date,
    previous: MoodRhythm | None,
) -> MoodRhythm | None:
    """New material while the Space holds daily.insights, otherwise the frozen one."""
    if entitlements.has_capability(session, space_id, CAPABILITY):
        return compute(session, space_id, kind, starts_on, through_on)
    return previous


def visible(session: Session, space_id: UUID, payload: RecapPayload) -> MoodRhythm | None:
    """Serve the frozen aggregate only while both partners and the Vibe module remain."""
    mood = payload.mood
    if mood is None or _partners(session, space_id) is None:
        return None
    return mood if _vibe_enabled(session, space_id) else None
