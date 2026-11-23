"""The garden's history: what happened between the two, newest first (#2158 G).

The history is a read model over the garden's own rows; nothing new is stored
for it. Each entry belongs to one calendar day of the couple and has a fixed
rank within that day, so the list reads the way a day unfolded:

1. a partner sent a seed (``garden_plants.sent_on``);
2. a seed was planted, by the receiver or by itself on a later day
   (``planted_at``);
3. both partners were there and the garden grew (a day with two senders);
4. a plant bloomed for the first time (``bloomed_on``);
5. someone watered, or both did (``garden_waterings``);
6. a bouquet was given (``garden_bouquets``);
7. a received bouquet went into Momente (``closed_at`` with ``kept``).

Privacy follows the garden view. A wrapped surprise is shown as a surprise
until it first blooms. A seed that still waits for the reader carries no words:
they stay folded on its card until it is planted. Everything is scoped to the
reader's Space and the cursor is bound to Space and reader.

Pagination is keyset over ``(day, rank, at, ident)``. Every source is queried
with an exact bound for that order and a limit, and the sources are merged, so
a page never reads the whole history.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, func, literal, select, tuple_
from sqlalchemy.orm import QueryableAttribute, Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core import cursor as cursor_codec
from eimir.recaps.service import calendar_context
from eimir_pro.garden import growth
from eimir_pro.garden import service as garden_service
from eimir_pro.garden.models import (
    GardenBouquet,
    GardenHistoryKind,
    GardenPlant,
    GardenSpecies,
    GardenWatering,
    GardenWords,
)

MAX_LIMIT = 50

# Date-only entries sort as if they happened at the start of their day; within
# one rank they are unique per day or ordered by their id.
_NO_TIME = datetime(1970, 1, 1, tzinfo=UTC)
_NO_ID = UUID(int=0)


RANK = {
    GardenHistoryKind.SEED_SENT: 1,
    GardenHistoryKind.SEED_PLANTED: 2,
    GardenHistoryKind.SHARED_DAY: 3,
    GardenHistoryKind.FIRST_BLOOM: 4,
    GardenHistoryKind.WATERED: 5,
    GardenHistoryKind.WATERED_TOGETHER: 5,
    GardenHistoryKind.BOUQUET_GIVEN: 6,
    GardenHistoryKind.BOUQUET_KEPT: 7,
}


@dataclass(frozen=True)
class HistoryEntry:
    kind: GardenHistoryKind
    happened_on: date
    at: datetime
    ident: UUID
    actor_id: UUID | None = None
    sender_id: UUID | None = None
    species: GardenSpecies | None = None
    words: GardenWords | None = None
    flowers: tuple[tuple[GardenSpecies, UUID], ...] = ()
    waiting: bool = False

    @property
    def sort_key(self) -> tuple[date, int, datetime, UUID]:
        return (self.happened_on, RANK[self.kind], self.at, self.ident)

    @property
    def key(self) -> str:
        """A stable identity for clients, unique within the history."""
        ident = self.happened_on.isoformat() if self.ident == _NO_ID else str(self.ident)
        return f"{self.kind}:{ident}"


@dataclass(frozen=True)
class HistoryPage:
    items: list[HistoryEntry] = field(default_factory=list)
    next_cursor: str | None = None
    has_more: bool = False


@dataclass(frozen=True)
class _Position:
    day: date
    rank: int
    at: datetime
    ident: UUID


def _binding(context: AuthorizationContext) -> dict[str, Any]:
    # Entries depend on the reader (a waiting seed, its folded words), so a
    # cursor continues only the reader's own history in their Space.
    return {
        "collection": "garden_history",
        "spaceId": str(context.space_id),
        "accountId": str(context.account_id),
    }


def _encode(context: AuthorizationContext, entry: HistoryEntry) -> str:
    day, rank, at, ident = entry.sort_key
    return cursor_codec.encode(
        binding=_binding(context),
        position={
            "day": day.isoformat(),
            "rank": rank,
            "at": at.astimezone(UTC).isoformat(),
            "id": str(ident),
        },
    )


def _decode(context: AuthorizationContext, token: str) -> _Position:
    position = cursor_codec.decode(token, binding=_binding(context))
    try:
        day = date.fromisoformat(position["day"])
        rank = position["rank"]
        at = datetime.fromisoformat(position["at"])
        ident = UUID(position["id"])
    except (KeyError, TypeError, ValueError) as error:
        raise cursor_codec.invalid_cursor() from error
    if not isinstance(rank, int) or at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return _Position(day=day, rank=rank, at=at.astimezone(UTC), ident=ident)


class _Days:
    """The couple's calendar days as instants, for timestamp-based entries."""

    def __init__(self, zone: str) -> None:
        self.zone = clock.resolve_zone(zone)

    def start(self, day: date) -> datetime:
        return datetime.combine(day, time(0), self.zone)

    def of(self, instant: datetime) -> date:
        return clock.ensure_utc(instant).astimezone(self.zone).date()


def _date_bound(
    rank: int,
    after: _Position | None,
    day: QueryableAttribute[Any],
    *tiebreak: QueryableAttribute[Any],
) -> ColumnElement[bool] | None:
    """Rows of a day-dated source that sort before the cursor.

    ``tiebreak`` names the source's further sort columns, compared only when
    the cursor stands on the same rank: ``(at, id)`` or ``(id,)``. Without
    them the source has one entry per day.
    """
    if after is None:
        return None
    if rank < after.rank:
        return day <= literal(after.day)
    if rank > after.rank or not tiebreak:
        return day < literal(after.day)
    values = (after.at, after.ident)[-len(tiebreak) :]
    bound: ColumnElement[bool] = tuple_(day, *tiebreak) < tuple_(
        literal(after.day), *(literal(value) for value in values)
    )
    return bound


def _instant_bound(
    rank: int,
    after: _Position | None,
    instant: QueryableAttribute[Any],
    ident: QueryableAttribute[Any],
    days: _Days,
) -> ColumnElement[bool] | None:
    """Rows of a timestamp-dated source that sort before the cursor.

    The day of such a row grows with its instant, so a bound on the day is a
    bound on the instant.
    """
    if after is None:
        return None
    if rank < after.rank:
        return instant < literal(days.start(after.day + timedelta(days=1)))
    if rank > after.rank:
        return instant < literal(days.start(after.day))
    bound: ColumnElement[bool] = tuple_(instant, ident) < tuple_(
        literal(after.at), literal(after.ident)
    )
    return bound


def _where(*conditions: ColumnElement[bool] | None) -> list[ColumnElement[bool]]:
    return [condition for condition in conditions if condition is not None]


def _seeds_sent(
    session: Session, context: AuthorizationContext, after: _Position | None, limit: int
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.SEED_SENT]
    rows = session.scalars(
        select(GardenPlant)
        .where(
            GardenPlant.space_id == context.space_id,
            *_where(
                _date_bound(
                    rank,
                    after,
                    GardenPlant.sent_on,
                    GardenPlant.created_at,
                    GardenPlant.id,
                )
            ),
        )
        .order_by(GardenPlant.sent_on.desc(), GardenPlant.created_at.desc(), GardenPlant.id.desc())
        .limit(limit)
    )
    entries = []
    for plant in rows:
        # A seed that still waits for the reader keeps its words folded.
        waiting = plant.receiver_id == context.account_id and plant.planted_at is None
        entries.append(
            HistoryEntry(
                kind=GardenHistoryKind.SEED_SENT,
                happened_on=plant.sent_on,
                at=plant.created_at,
                ident=plant.id,
                actor_id=plant.sender_id,
                sender_id=plant.sender_id,
                species=growth.shown_species(plant.species, plant.bloomed),
                words=GardenWords(plant.words) if plant.words and not waiting else None,
                waiting=waiting,
            )
        )
    return entries


def _seeds_planted(
    session: Session,
    context: AuthorizationContext,
    after: _Position | None,
    limit: int,
    days: _Days,
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.SEED_PLANTED]
    rows = session.scalars(
        select(GardenPlant)
        .where(
            GardenPlant.space_id == context.space_id,
            GardenPlant.planted_at.is_not(None),
            *_where(_instant_bound(rank, after, GardenPlant.planted_at, GardenPlant.id, days)),
        )
        .order_by(GardenPlant.planted_at.desc(), GardenPlant.id.desc())
        .limit(limit)
    )
    entries = []
    for plant in rows:
        assert plant.planted_at is not None
        planted_on = days.of(plant.planted_at)
        entries.append(
            HistoryEntry(
                kind=GardenHistoryKind.SEED_PLANTED,
                happened_on=planted_on,
                at=clock.ensure_utc(plant.planted_at),
                ident=plant.id,
                # The receiver plants on the day the seed arrives; a seed
                # planted on a later day found its place by itself.
                actor_id=plant.receiver_id if planted_on <= plant.sent_on else None,
                sender_id=plant.sender_id,
                species=growth.shown_species(plant.species, plant.bloomed),
                words=GardenWords(plant.words) if plant.words else None,
            )
        )
    return entries


def _shared_days(
    session: Session, context: AuthorizationContext, after: _Position | None, limit: int
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.SHARED_DAY]
    rows = session.scalars(
        select(GardenPlant.sent_on)
        .where(
            GardenPlant.space_id == context.space_id,
            *_where(_date_bound(rank, after, GardenPlant.sent_on)),
        )
        .group_by(GardenPlant.sent_on)
        .having(func.count(func.distinct(GardenPlant.sender_id)) >= 2)
        .order_by(GardenPlant.sent_on.desc())
        .limit(limit)
    )
    return [
        HistoryEntry(kind=GardenHistoryKind.SHARED_DAY, happened_on=day, at=_NO_TIME, ident=_NO_ID)
        for day in rows
    ]


def _first_blooms(
    session: Session, context: AuthorizationContext, after: _Position | None, limit: int
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.FIRST_BLOOM]
    rows = session.scalars(
        select(GardenPlant)
        .where(
            GardenPlant.space_id == context.space_id,
            GardenPlant.bloomed_on.is_not(None),
            *_where(
                _date_bound(
                    rank,
                    after,
                    GardenPlant.bloomed_on,
                    GardenPlant.id,
                )
            ),
        )
        .order_by(GardenPlant.bloomed_on.desc(), GardenPlant.id.desc())
        .limit(limit)
    )
    entries = []
    for plant in rows:
        assert plant.bloomed_on is not None
        entries.append(
            HistoryEntry(
                kind=GardenHistoryKind.FIRST_BLOOM,
                happened_on=plant.bloomed_on,
                at=_NO_TIME,
                ident=plant.id,
                sender_id=plant.sender_id,
                species=GardenSpecies(plant.species),
            )
        )
    return entries


def _waterings(
    session: Session, context: AuthorizationContext, after: _Position | None, limit: int
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.WATERED]
    watered_days = list(
        session.scalars(
            select(GardenWatering.watered_on)
            .where(
                GardenWatering.space_id == context.space_id,
                *_where(_date_bound(rank, after, GardenWatering.watered_on)),
            )
            .group_by(GardenWatering.watered_on)
            .order_by(GardenWatering.watered_on.desc())
            .limit(limit)
        )
    )
    if not watered_days:
        return []
    rows = session.execute(
        select(GardenWatering, GardenPlant)
        .join(GardenPlant, GardenPlant.id == GardenWatering.plant_id)
        .where(
            GardenWatering.space_id == context.space_id,
            GardenWatering.watered_on.in_(watered_days),
        )
        .order_by(GardenWatering.watered_on.desc(), GardenWatering.id)
    ).all()
    by_day: dict[date, list[tuple[GardenWatering, GardenPlant]]] = {}
    for watering, plant in rows:
        by_day.setdefault(watering.watered_on, []).append((watering, plant))
    entries = []
    for day in watered_days:
        gestures = by_day.get(day, [])
        if not gestures:
            continue
        if len({watering.account_id for watering, _ in gestures}) >= 2:
            entries.append(
                HistoryEntry(
                    kind=GardenHistoryKind.WATERED_TOGETHER,
                    happened_on=day,
                    at=_NO_TIME,
                    ident=_NO_ID,
                )
            )
            continue
        watering, plant = gestures[0]
        entries.append(
            HistoryEntry(
                kind=GardenHistoryKind.WATERED,
                happened_on=day,
                at=_NO_TIME,
                ident=_NO_ID,
                actor_id=watering.account_id,
                sender_id=plant.sender_id,
                species=growth.shown_species(plant.species, plant.bloomed),
            )
        )
    return entries


def _flowers(bouquet: GardenBouquet) -> tuple[tuple[GardenSpecies, UUID], ...]:
    return tuple(
        (GardenSpecies(species), sender)
        for species, sender in zip(bouquet.flowers, bouquet.flower_senders, strict=True)
    )


def _bouquets_given(
    session: Session, context: AuthorizationContext, after: _Position | None, limit: int
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.BOUQUET_GIVEN]
    rows = session.scalars(
        select(GardenBouquet)
        .where(
            GardenBouquet.space_id == context.space_id,
            *_where(
                _date_bound(
                    rank,
                    after,
                    GardenBouquet.given_on,
                    GardenBouquet.created_at,
                    GardenBouquet.id,
                )
            ),
        )
        .order_by(
            GardenBouquet.given_on.desc(), GardenBouquet.created_at.desc(), GardenBouquet.id.desc()
        )
        .limit(limit)
    )
    return [
        HistoryEntry(
            kind=GardenHistoryKind.BOUQUET_GIVEN,
            happened_on=bouquet.given_on,
            at=bouquet.created_at,
            ident=bouquet.id,
            actor_id=bouquet.giver_id,
            flowers=_flowers(bouquet),
        )
        for bouquet in rows
    ]


def _bouquets_kept(
    session: Session,
    context: AuthorizationContext,
    after: _Position | None,
    limit: int,
    days: _Days,
) -> list[HistoryEntry]:
    rank = RANK[GardenHistoryKind.BOUQUET_KEPT]
    rows = session.scalars(
        select(GardenBouquet)
        .where(
            GardenBouquet.space_id == context.space_id,
            GardenBouquet.kept.is_(True),
            GardenBouquet.closed_at.is_not(None),
            *_where(_instant_bound(rank, after, GardenBouquet.closed_at, GardenBouquet.id, days)),
        )
        .order_by(GardenBouquet.closed_at.desc(), GardenBouquet.id.desc())
        .limit(limit)
    )
    entries = []
    for bouquet in rows:
        assert bouquet.closed_at is not None
        entries.append(
            HistoryEntry(
                kind=GardenHistoryKind.BOUQUET_KEPT,
                happened_on=days.of(bouquet.closed_at),
                at=clock.ensure_utc(bouquet.closed_at),
                ident=bouquet.id,
                actor_id=bouquet.receiver_id,
                flowers=_flowers(bouquet),
            )
        )
    return entries


def _newest(sources: Iterable[list[HistoryEntry]], count: int) -> list[HistoryEntry]:
    merged = [entry for source in sources for entry in source]
    merged.sort(key=lambda entry: entry.sort_key, reverse=True)
    return merged[:count]


def history(
    session: Session, context: AuthorizationContext, *, cursor: str | None, limit: int
) -> HistoryPage:
    """One page of the couple's garden history, newest first."""
    garden_service.require_couple(session, context)
    after = _decode(context, cursor) if cursor is not None else None
    zone, _ = calendar_context(session, context)
    days = _Days(zone)
    # Like the garden view: an overdue seed is planted before it is read.
    garden_service.settle(session, context, clock.today_in(zone))
    # Each source returns at most one entry more than the page; the merged
    # first `limit + 1` entries are then exact.
    take = limit + 1
    entries = _newest(
        (
            _seeds_sent(session, context, after, take),
            _seeds_planted(session, context, after, take, days),
            _shared_days(session, context, after, take),
            _first_blooms(session, context, after, take),
            _waterings(session, context, after, take),
            _bouquets_given(session, context, after, take),
            _bouquets_kept(session, context, after, take, days),
        ),
        take,
    )
    has_more = len(entries) > limit
    items = entries[:limit]
    return HistoryPage(
        items=items,
        next_cursor=_encode(context, items[-1]) if has_more and items else None,
        has_more=has_more,
    )


__all__ = ["MAX_LIMIT", "HistoryEntry", "HistoryPage", "history"]
