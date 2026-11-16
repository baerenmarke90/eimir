"""Read-only journey context of a Wish, derived from existing relations (#1790 F2).

A Wish's visible journey (wished -> planned -> experienced -> remembered) is
never stored. It is derived from data that already exists:

- ``Wish.status`` (``OPEN``/``PLANNED``/``COMPLETED``);
- the originating Plan, ``Plan.source_wish_id`` (unique per Wish, M3-D02);
- a linked Memory, through ``memory_wishes`` or ``memory_plans`` of the
  originating Plan.

This module adds no table, status, or lifecycle edge. It only answers the
questions the Wish list and detail need for presentation, for a whole page of
Wishes at once so a list costs a constant number of queries.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.memories.models import Memory
from eimir.plans.models import Plan
from eimir.relations.models import MemoryPlan, MemoryWish
from eimir.wishes.models import Wish, WishStatus


@dataclass(frozen=True)
class WishJourney:
    plan: Plan | None
    """The originating Plan, or ``None`` (open, directly completed, returned)."""

    has_memory: bool
    """A readable Memory is linked to the Wish or to its originating Plan."""


NO_JOURNEY = WishJourney(plan=None, has_memory=False)

# Only wishes that left ``OPEN`` have a journey beyond "wished". A Memory linked
# to an ``OPEN`` wish does not make it remembered, so open wishes cost nothing.
_JOURNEY_STATUSES = frozenset({WishStatus.PLANNED.value, WishStatus.COMPLETED.value})


def journeys_for(
    session: Session,
    context: AuthorizationContext,
    wishes: Iterable[Wish],
) -> dict[UUID, WishJourney]:
    """Return the journey of each given Wish, keyed by Wish ID."""
    relevant = [wish for wish in wishes if wish.status in _JOURNEY_STATUSES]
    if not relevant:
        return {}
    wish_ids = [wish.id for wish in relevant]

    # Plans and Memories are space-shared, but the read predicate still comes
    # from the authorization entry point rather than an assumption about it.
    plans = {
        plan.source_wish_id: plan
        for plan in session.execute(
            readable(Plan, context).where(Plan.source_wish_id.in_(wish_ids))
        ).scalars()
        if plan.source_wish_id is not None
    }
    readable_memory_ids = readable(Memory, context).with_only_columns(Memory.id)
    remembered_wishes = set(
        session.execute(
            select(MemoryWish.wish_id)
            .where(MemoryWish.wish_id.in_(wish_ids))
            .where(MemoryWish.memory_id.in_(readable_memory_ids.scalar_subquery()))
        ).scalars()
    )
    plan_ids = [plan.id for plan in plans.values()]
    remembered_plans = (
        set(
            session.execute(
                select(MemoryPlan.plan_id)
                .where(MemoryPlan.plan_id.in_(plan_ids))
                .where(MemoryPlan.memory_id.in_(readable_memory_ids.scalar_subquery()))
            ).scalars()
        )
        if plan_ids
        else set()
    )

    journeys: dict[UUID, WishJourney] = {}
    for wish in relevant:
        plan = plans.get(wish.id)
        journeys[wish.id] = WishJourney(
            plan=plan,
            has_memory=wish.id in remembered_wishes
            or (plan is not None and plan.id in remembered_plans),
        )
    return journeys


def journey_for(session: Session, context: AuthorizationContext, wish: Wish) -> WishJourney:
    """Return the journey of one Wish."""
    return journeys_for(session, context, [wish]).get(wish.id, NO_JOURNEY)
