"""Server-authoritative rules of the shared garden.

Each partner may send one seed per local calendar day. The partner plants it;
a seed nobody planted is planted automatically on a later day, so a pause never
loses anything. On the day both partners sent a seed every plant in the ground
grows one stage, exactly once. Watering is a daily gesture that never changes
growth. Distance and location never reach this module.

Presentation state is derived, never stored: the garden sleeps after a pause of
both partners and wakes when one of them returns, and the next pinned shared
Plan (#504) is the couple's reunion, shown by its day only.

PR 3 (growth and life) adds the cumulative shared days that unlock new things,
more species (a water lily lives in the pond, a tulip waits for spring, a
wrapped surprise becomes a moonflower), bouquets, the garden's name and the
once-per-person "new in the garden" news. Every rule stays server-side.
The couple may also give each visiting animal one shared name.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import Date, Select, cast, delete, func, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, readable
from eimir.core import clock
from eimir.core.errors import ConflictError, NotFoundError, ValidationError
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement.models import Notification
from eimir.garden import growth
from eimir.garden.models import (
    MAX_STAGE,
    Garden,
    GardenBouquet,
    GardenForm,
    GardenPlant,
    GardenReader,
    GardenSpecies,
    GardenUnlock,
    GardenVisitor,
    GardenVisitorName,
    GardenWatering,
    GardenWords,
)
from eimir.outbox import service as outbox_service
from eimir.plans.models import Plan, PlanAnticipation, PlanStatus
from eimir.recaps.service import calendar_context
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus

SLEEP_AFTER_DAYS = 4
"""Full calendar days without either partner in the garden before it sleeps."""
NAME_MAX = 40


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
    shared_days: int = 0
    form: GardenForm = GardenForm.BED
    unlocks: list[GardenUnlock] = field(default_factory=list)
    news: list[GardenUnlock] = field(default_factory=list)
    discovered: list[GardenSpecies] = field(default_factory=list)
    name: str | None = None
    visitor_names: dict[GardenVisitor, str] = field(default_factory=dict)
    bouquet: GardenBouquet | None = None
    gave_bouquet_today: bool = False


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


def shared_days(session: Session, space_id: UUID) -> int:
    """Days on which both partners sent a seed; derived, never reset."""
    both = (
        select(GardenPlant.sent_on)
        .where(GardenPlant.space_id == space_id)
        .group_by(GardenPlant.sent_on)
        .having(func.count(func.distinct(GardenPlant.sender_id)) >= 2)
        .subquery()
    )
    return int(session.scalar(select(func.count()).select_from(both)) or 0)


def _pond_lilies(session: Session, space_id: UUID) -> int:
    """Water lilies in the pond or still on their way to it."""
    return int(
        session.scalar(
            select(func.count(GardenPlant.id)).where(
                GardenPlant.space_id == space_id,
                GardenPlant.species == GardenSpecies.WATER_LILY.value,
            )
        )
        or 0
    )


def _offer(session: Session, space_id: UUID, today: date, days: int) -> tuple[GardenSpecies, ...]:
    room = _pond_lilies(session, space_id) < growth.POND_CAPACITY
    return growth.offer(today, days, pond_has_room=room)


def _plant(session: Session, seed: GardenPlant) -> None:
    """Put a seed into the next free place: the pond for a water lily."""
    in_pond = seed.species == GardenSpecies.WATER_LILY.value
    if in_pond:
        used = {
            slot
            for slot in session.scalars(
                select(GardenPlant.slot).where(
                    GardenPlant.space_id == seed.space_id,
                    GardenPlant.in_pond.is_(True),
                )
            )
            if slot is not None
        }
        free = next((slot for slot in range(growth.POND_CAPACITY) if slot not in used), None)
        # The offer keeps the pond from overflowing; a full pond still never loses a seed.
        next_slot = free if free is not None else max(used, default=-1) + 1
    else:
        next_slot = int(
            session.scalar(
                select(func.coalesce(func.max(GardenPlant.slot) + 1, 0)).where(
                    GardenPlant.space_id == seed.space_id, GardenPlant.in_pond.is_(False)
                )
            )
            or 0
        )
    seed.in_pond = in_pond
    seed.slot = next_slot
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
    """The next pinned shared Plan (#504) marks the reunion; its day only.

    Only an explicit ``ALWAYS`` choice counts (#2158 D). The Wir countdown also
    falls back to the next ``AUTOMATIC`` Plan, but an ordinary dinner is not a
    reunion, and the reunion keeps the garden awake.
    """
    starts = func.coalesce(Plan.planned_on, cast(func.timezone(zone, Plan.planned_start), Date))
    ends = func.coalesce(
        Plan.planned_until, cast(func.timezone(zone, Plan.planned_end), Date), starts
    )
    row = session.execute(
        readable(Plan, context)
        .where(
            Plan.anticipation == PlanAnticipation.ALWAYS.value,
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
    days = shared_days(session, context.space_id)
    seen = session.scalar(
        select(GardenReader.seen_shared_days).where(
            GardenReader.space_id == context.space_id,
            GardenReader.account_id == context.account_id,
        )
    )
    bloomed = session.scalars(
        select(GardenPlant.species)
        .where(GardenPlant.space_id == context.space_id, GardenPlant.bloomed.is_(True))
        .distinct()
    )
    garden = session.get(Garden, context.space_id)
    visitor_names = {
        GardenVisitor(row.animal): row.name
        for row in session.scalars(
            select(GardenVisitorName).where(GardenVisitorName.space_id == context.space_id)
        )
    }
    bouquet = session.scalar(
        select(GardenBouquet)
        .where(
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.receiver_id == context.account_id,
            GardenBouquet.closed_at.is_(None),
        )
        .order_by(GardenBouquet.given_on.desc(), GardenBouquet.created_at.desc())
        .limit(1)
    )
    gave_today = session.scalar(
        select(GardenBouquet.id).where(
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.giver_id == context.account_id,
            GardenBouquet.given_on == today,
        )
    )
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
        offer=_offer(session, context.space_id, today, days),
        shared_days=days,
        form=growth.form(days),
        unlocks=growth.unlocked(days),
        news=growth.reached_between(seen or 0, days),
        discovered=growth.discovered(bloomed),
        name=garden.name if garden else None,
        # Closed catalog order, so both partners read the same list.
        visitor_names={
            animal: visitor_names[animal] for animal in GardenVisitor if animal in visitor_names
        },
        bouquet=bouquet,
        gave_bouquet_today=gave_today is not None,
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
    days = shared_days(session, context.space_id)
    if species not in _offer(session, context.space_id, today, days):
        raise ValidationError("This seed is not on offer today.", "GARDEN_SEED_NOT_OFFERED")
    stored = GardenSpecies.MOONFLOWER if species is GardenSpecies.SURPRISE else species
    seed = GardenPlant(
        space_id=context.space_id,
        sender_id=context.account_id,
        receiver_id=partner,
        species=stored.value,
        in_pond=stored is GardenSpecies.WATER_LILY,
        words=words.value if words else None,
        sent_on=today,
        stage=0,
    )
    session.add(seed)
    session.flush()
    if any(other.sender_id == partner for other in todays):
        # Both were there today: everything in the ground grows one stage, once.
        # A tulip bulb rests until spring; nothing ever goes back a stage.
        for plant in session.scalars(
            select(GardenPlant).where(
                GardenPlant.space_id == context.space_id,
                GardenPlant.planted_at.is_not(None),
                GardenPlant.stage < MAX_STAGE,
            )
        ):
            if not growth.can_grow(plant.species, plant.stage, today):
                continue
            plant.stage += 1
            if plant.stage == MAX_STAGE:
                plant.bloomed = True
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


def acknowledge_news(session: Session, context: AuthorizationContext) -> GardenState:
    """The reader saw what is new; each unlock is announced once per person."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    days = shared_days(session, context.space_id)
    session.execute(
        postgresql.insert(GardenReader)
        .values(space_id=context.space_id, account_id=context.account_id, seen_shared_days=days)
        .on_conflict_do_update(
            index_elements=[GardenReader.space_id, GardenReader.account_id],
            set_={"seen_shared_days": days},
        )
    )
    session.flush()
    return state(session, context)


def _clean_name(name: str | None, *, message: str, code: str) -> str:
    """Collapse whitespace; the result is empty or at most NAME_MAX characters."""
    cleaned = " ".join((name or "").split())
    if len(cleaned) > NAME_MAX:
        raise ValidationError(message, code)
    return cleaned


def rename(session: Session, context: AuthorizationContext, name: str | None) -> GardenState:
    """Name the garden; an empty name returns to the default title."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    cleaned = _clean_name(name, message="The garden name is too long.", code="GARDEN_NAME_TOO_LONG")
    garden = session.get(Garden, context.space_id)
    if not cleaned:
        if garden is not None:
            session.delete(garden)
    elif garden is None:
        session.add(Garden(space_id=context.space_id, name=cleaned, updated_at=clock.now()))
    else:
        garden.name = cleaned
        garden.updated_at = clock.now()
    session.flush()
    return state(session, context)


def name_visitor(
    session: Session,
    context: AuthorizationContext,
    animal: GardenVisitor,
    name: str | None,
) -> GardenState:
    """Name a visiting animal for both partners; an empty name removes it."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    cleaned = _clean_name(
        name, message="The visitor name is too long.", code="GARDEN_VISITOR_NAME_TOO_LONG"
    )
    row = session.get(GardenVisitorName, (context.space_id, animal.value))
    if not cleaned:
        if row is not None:
            session.delete(row)
    elif row is None:
        session.add(
            GardenVisitorName(
                space_id=context.space_id,
                animal=animal.value,
                name=cleaned,
                updated_at=clock.now(),
            )
        )
    else:
        row.name = cleaned
        row.updated_at = clock.now()
    session.flush()
    return state(session, context)


def give_bouquet(
    session: Session, context: AuthorizationContext, plant_ids: list[UUID]
) -> GardenState:
    """Pick up to three blooms for the partner; a seed stays in each place."""
    relationship.lock_space(session, context.space_id)
    partner = _partner_of(session, context)
    today = _today(session, context)
    unique = list(dict.fromkeys(plant_ids))
    if not 1 <= len(unique) <= growth.MAX_BOUQUET or len(unique) != len(plant_ids):
        raise ValidationError("A bouquet holds one to three flowers.", "GARDEN_BOUQUET_SIZE")
    already = session.scalar(
        select(GardenBouquet.id).where(
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.giver_id == context.account_id,
            GardenBouquet.given_on == today,
        )
    )
    if already is not None:
        raise ConflictError("You already gave a bouquet today.", "GARDEN_BOUQUET_ALREADY_GIVEN")
    plants = {
        plant.id: plant
        for plant in session.scalars(
            select(GardenPlant).where(
                GardenPlant.space_id == context.space_id,
                GardenPlant.id.in_(unique),
                GardenPlant.planted_at.is_not(None),
                GardenPlant.in_pond.is_(False),
            )
        )
    }
    if len(plants) != len(unique):
        raise NotFoundError("Plant not found.", "GARDEN_PLANT_NOT_FOUND")
    chosen = [plants[plant_id] for plant_id in unique]
    if not all(growth.is_blooming(plant.species, plant.stage, today) for plant in chosen):
        raise ConflictError("Only blooming flowers fit a bouquet.", "GARDEN_PLANT_NOT_BLOOMING")
    bouquet = GardenBouquet(
        space_id=context.space_id,
        giver_id=context.account_id,
        receiver_id=partner,
        given_on=today,
        flowers=[plant.species for plant in chosen],
        flower_senders=[plant.sender_id for plant in chosen],
    )
    session.add(bouquet)
    for plant in chosen:
        # The flower leaves with the bouquet; its seed stays and grows again.
        plant.stage = 0
    session.flush()
    outbox_service.record(
        session,
        DomainEvent(
            type=EventType.GARDEN_BOUQUET_GIVEN,
            space_id=context.space_id,
            actor_id=context.account_id,
            subject_type="garden_bouquet",
            subject_id=bouquet.id,
            resource_version=1,
            payload=PublicEventPayload(recipient_id=partner),
        ),
    )
    return state(session, context)


def close_bouquet(
    session: Session, context: AuthorizationContext, bouquet_id: UUID, *, kept: bool
) -> GardenState:
    """The receiver says thanks; `kept` records that it went into Momente."""
    relationship.lock_space(session, context.space_id)
    _partner_of(session, context)
    bouquet = session.scalar(
        select(GardenBouquet).where(
            GardenBouquet.id == bouquet_id,
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.receiver_id == context.account_id,
        )
    )
    if bouquet is None:
        raise NotFoundError("Bouquet not found.", "GARDEN_BOUQUET_NOT_FOUND")
    if bouquet.closed_at is None:
        bouquet.closed_at = clock.now()
    bouquet.kept = bouquet.kept or kept
    session.flush()
    return state(session, context)


def bouquet_is_open(
    session: Session, context: AuthorizationContext, bouquet_id: Any
) -> Select[tuple[UUID]]:
    """Selectable predicate: a bouquet for the reader that still waits on its card."""
    return select(GardenBouquet.id).where(
        GardenBouquet.id == bouquet_id,
        GardenBouquet.space_id == context.space_id,
        GardenBouquet.receiver_id == context.account_id,
        GardenBouquet.closed_at.is_(None),
    )


def notice_taken_today(
    session: Session, space_id: UUID, recipient_id: UUID, at: datetime, kind: str
) -> bool:
    """At most one garden notice per person and local day (Product Owner 2026-11-16)."""
    zone, _ = calendar_context(
        session, AuthorizationContext(account_id=recipient_id, space_id=space_id)
    )
    day = clock.today_in(zone, at=at)
    earlier = session.scalars(
        select(Notification.created_at).where(
            Notification.space_id == space_id,
            Notification.recipient_account_id == recipient_id,
            Notification.kind == kind,
            Notification.created_at > at - timedelta(days=2),
            Notification.created_at <= at,
        )
    )
    return any(clock.today_in(zone, at=created) == day for created in earlier)


def purge_space(session: Session, space_id: UUID) -> None:
    """The garden belongs to one couple; it is removed when the couple changes."""
    session.execute(delete(GardenWatering).where(GardenWatering.space_id == space_id))
    session.execute(delete(GardenPlant).where(GardenPlant.space_id == space_id))
    session.execute(delete(GardenBouquet).where(GardenBouquet.space_id == space_id))
    session.execute(delete(GardenReader).where(GardenReader.space_id == space_id))
    session.execute(delete(GardenVisitorName).where(GardenVisitorName.space_id == space_id))
    session.execute(delete(Garden).where(Garden.space_id == space_id))
    session.flush()
