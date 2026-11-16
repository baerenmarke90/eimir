"""Server-authoritative rules of the shared garden.

Each partner may send one seed per local calendar day. The partner plants it;
a seed nobody planted is planted automatically on a later day, so a pause never
loses anything. On the day both partners sent a seed every plant in the ground
grows one stage, exactly once. Watering is a daily gesture that never changes
growth. Distance and location never reach this module.

Presentation state is derived, never stored: the garden sleeps after a pause of
both partners and wakes when one of them returns, and the next anticipated
shared Plan (#504) is the couple's reunion, shown by its day only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import Date, Select, cast, delete, func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core import clock
from eimir.core.errors import ConflictError, NotFoundError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.garden.models import MAX_STAGE, GardenPlant, GardenSpecies, GardenWatering, GardenWords
from eimir.outbox import service as outbox_service
from eimir.plans.models import Plan, PlanStatus
from eimir.recaps.service import calendar_context
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus

OFFER = (GardenSpecies.POPPY, GardenSpecies.BELLFLOWER, GardenSpecies.STARFLOWER)
SLEEP_AFTER_DAYS = 4
"""Full calendar days without either partner in the garden before it sleeps."""


@dataclass(frozen=True)
class GardenState:
    local_date: date
    partner_id: UUID
    plants: list[GardenPlant]
    incoming: GardenPlant | None
    sent_today: GardenPlant | None
    partner_sent_today: bool
    shared_today: bool
    watered_today: UUID | None
    partner_watered_today: UUID | None
    offer: tuple[GardenSpecies, ...]
    sleeping: bool = False
    reunion_on: date | None = None
    reunion_today: bool = False


def _partner_of(session: Session, context: AuthorizationContext) -> UUID:
    members = list(
        session.scalars(
            select(Membership.account_id).where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    )
    others = [member for member in members if member != context.account_id]
    if context.account_id not in members or len(members) != 2 or len(others) != 1:
        raise ConflictError(
            "The garden needs exactly two partners in the Space.",
            "GARDEN_COUPLE_REQUIRED",
        )
    return others[0]


def _today(session: Session, context: AuthorizationContext) -> date:
    zone, _ = calendar_context(session, context)
    return clock.today_in(zone)


def _seeds_on(session: Session, space_id: UUID, day: date) -> list[GardenPlant]:
    return list(
        session.scalars(
            select(GardenPlant).where(GardenPlant.space_id == space_id, GardenPlant.sent_on == day)
        )
    )


def _plant(session: Session, seed: GardenPlant) -> None:
    next_slot = session.scalar(
        select(func.coalesce(func.max(GardenPlant.slot) + 1, 0)).where(
            GardenPlant.space_id == seed.space_id
        )
    )
    seed.slot = int(next_slot or 0)
    seed.planted_at = clock.now()
    seed.stage = 0
    session.flush()


def _settle(session: Session, context: AuthorizationContext, today: date) -> None:
    """Plant seeds from earlier days that nobody planted; nothing is ever lost."""
    overdue = select(GardenPlant.id).where(
        GardenPlant.space_id == context.space_id,
        GardenPlant.planted_at.is_(None),
        GardenPlant.sent_on < today,
    )
    if session.scalar(overdue.limit(1)) is None:
        return
    relationship.lock_space(session, context.space_id)
    for seed in session.scalars(
        select(GardenPlant)
        .where(
            GardenPlant.space_id == context.space_id,
            GardenPlant.planted_at.is_(None),
            GardenPlant.sent_on < today,
        )
        .order_by(GardenPlant.sent_on, GardenPlant.created_at)
    ):
        _plant(session, seed)


def _last_visit(session: Session, space_id: UUID) -> date | None:
    """The latest day either partner sent a seed or watered."""
    seeds = session.scalar(
        select(func.max(GardenPlant.sent_on)).where(GardenPlant.space_id == space_id)
    )
    waterings = session.scalar(
        select(func.max(GardenWatering.watered_on)).where(GardenWatering.space_id == space_id)
    )
    days = [day for day in (seeds, waterings) if day is not None]
    return max(days) if days else None


def _reunion(
    session: Session, context: AuthorizationContext, zone: str, today: date
) -> tuple[date | None, bool]:
    """The next anticipated shared Plan (#504) marks the reunion; its day only."""
    starts = func.coalesce(Plan.planned_on, cast(func.timezone(zone, Plan.planned_start), Date))
    ends = func.coalesce(
        Plan.planned_until, cast(func.timezone(zone, Plan.planned_end), Date), starts
    )
    row = session.execute(
        readable(Plan, context)
        .where(
            Plan.anticipation_enabled.is_(True),
            Plan.status == PlanStatus.PLANNED.value,
            starts.is_not(None),
            ends >= today,
        )
        .order_by(starts, Plan.planned_start.asc().nulls_first(), Plan.id)
        .limit(1)
        .with_only_columns(starts, ends)
    ).first()
    if row is None:
        return None, False
    start, end = row
    return start, start <= today <= max(start, end)


def state(session: Session, context: AuthorizationContext) -> GardenState:
    partner = _partner_of(session, context)
    zone, _ = calendar_context(session, context)
    today = clock.today_in(zone)
    _settle(session, context, today)
    plants = list(
        session.scalars(
            select(GardenPlant)
            .where(GardenPlant.space_id == context.space_id, GardenPlant.planted_at.is_not(None))
            .order_by(GardenPlant.slot)
        )
    )
    todays = _seeds_on(session, context.space_id, today)
    mine = next((seed for seed in todays if seed.sender_id == context.account_id), None)
    theirs = next((seed for seed in todays if seed.sender_id == partner), None)
    incoming = session.scalar(
        select(GardenPlant)
        .where(
            GardenPlant.space_id == context.space_id,
            GardenPlant.receiver_id == context.account_id,
            GardenPlant.planted_at.is_(None),
        )
        .order_by(GardenPlant.sent_on.desc())
        .limit(1)
    )
    waterings = {
        row.account_id: row.plant_id
        for row in session.scalars(
            select(GardenWatering).where(
                GardenWatering.space_id == context.space_id, GardenWatering.watered_on == today
            )
        )
    }
    reunion_on, reunion_today = _reunion(session, context, zone, today)
    last_visit = _last_visit(session, context.space_id)
    return GardenState(
        local_date=today,
        partner_id=partner,
        plants=plants,
        incoming=incoming,
        sent_today=mine,
        partner_sent_today=theirs is not None,
        shared_today=mine is not None and theirs is not None,
        watered_today=waterings.get(context.account_id),
        partner_watered_today=waterings.get(partner),
        offer=OFFER,
        # Only a pause of both lets it sleep; it never sleeps on a reunion day.
        sleeping=(
            last_visit is not None
            and (today - last_visit).days > SLEEP_AFTER_DAYS
            and not reunion_today
        ),
        reunion_on=reunion_on,
        reunion_today=reunion_today,
    )


def send_seed(
    session: Session,
    context: AuthorizationContext,
    *,
    species: GardenSpecies,
    words: GardenWords | None,
) -> GardenState:
    """Send today's seed; the second seed of a day lets the whole garden grow."""
    relationship.lock_space(session, context.space_id)
    partner = _partner_of(session, context)
    today = _today(session, context)
    _settle(session, context, today)
    todays = _seeds_on(session, context.space_id, today)
    if any(seed.sender_id == context.account_id for seed in todays):
        raise ConflictError("You already sent a seed today.", "GARDEN_SEED_ALREADY_SENT")
    seed = GardenPlant(
        space_id=context.space_id,
        sender_id=context.account_id,
        receiver_id=partner,
        species=species.value,
        words=words.value if words else None,
        sent_on=today,
        stage=0,
    )
    session.add(seed)
    session.flush()
    if any(other.sender_id == partner for other in todays):
        # Both were there today: everything in the ground grows one stage, once.
        for plant in session.scalars(
            select(GardenPlant).where(
                GardenPlant.space_id == context.space_id,
                GardenPlant.planted_at.is_not(None),
                GardenPlant.stage < MAX_STAGE,
            )
        ):
            plant.stage += 1
        session.flush()
    outbox_service.record(
        session,
        DomainEvent(
            type=EventType.GARDEN_SEED_ARRIVED,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="garden_plant",
            subject_id=seed.id,
            resource_version=1,
            payload=PublicEventPayload(recipient_id=partner),
        ),
    )
    return state(session, context)


def plant_seed(session: Session, context: AuthorizationContext, seed_id: UUID) -> GardenState:
    """The receiver plants a seed that arrived for them."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    seed = session.scalar(
        select(GardenPlant).where(
            GardenPlant.id == seed_id,
            GardenPlant.space_id == context.space_id,
            GardenPlant.receiver_id == context.account_id,
        )
    )
    if seed is None:
        raise NotFoundError("Seed not found.", "GARDEN_SEED_NOT_FOUND")
    if seed.planted_at is not None:
        raise ConflictError("The seed is already planted.", "GARDEN_SEED_ALREADY_PLANTED")
    _plant(session, seed)
    return state(session, context)


def water(session: Session, context: AuthorizationContext, plant_id: UUID) -> GardenState:
    """One watering gesture per partner and day."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    today = _today(session, context)
    plant = session.scalar(
        select(GardenPlant).where(
            GardenPlant.id == plant_id,
            GardenPlant.space_id == context.space_id,
            GardenPlant.planted_at.is_not(None),
        )
    )
    if plant is None:
        raise NotFoundError("Plant not found.", "GARDEN_PLANT_NOT_FOUND")
    already = session.scalar(
        select(GardenWatering.id).where(
            GardenWatering.space_id == context.space_id,
            GardenWatering.account_id == context.account_id,
            GardenWatering.watered_on == today,
        )
    )
    if already is not None:
        raise ConflictError("You already watered today.", "GARDEN_ALREADY_WATERED")
    session.add(
        GardenWatering(
            space_id=context.space_id,
            account_id=context.account_id,
            plant_id=plant.id,
            watered_on=today,
        )
    )
    session.flush()
    return state(session, context)


def seed_is_waiting(
    session: Session, context: AuthorizationContext, seed_id: Any
) -> Select[tuple[UUID]]:
    """Selectable predicate: a seed for the reader that is not planted yet."""
    return select(GardenPlant.id).where(
        GardenPlant.id == seed_id,
        GardenPlant.space_id == context.space_id,
        GardenPlant.receiver_id == context.account_id,
        GardenPlant.planted_at.is_(None),
    )


def purge_space(session: Session, space_id: UUID) -> None:
    """The garden belongs to one couple; it is removed when the couple changes."""
    session.execute(delete(GardenWatering).where(GardenWatering.space_id == space_id))
    session.execute(delete(GardenPlant).where(GardenPlant.space_id == space_id))
    session.flush()
