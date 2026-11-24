"""The garden in an operator bundle (Decision 0020, slice S1b).

The garden is the one Pro area whose content grows over time and carries no secret: closed
codes (species, words), dates, stages, slots and the two partners' account ids. It travels in
``garden.json``. Games, one-time messages, location, calendar sync, photo sources and
notifications are not exported; they are set up again in the target.

Rules the import enforces, each before anything is written:

- the file is hostile input, so every row is checked against the database constraints it
  would otherwise trip over mid-insert (:func:`validate_rows`);
- the garden is added only to an **empty** garden of the target Space, because the daily seed
  and the bed slot are unique per Space and a merge rule would be a guess (:func:`skip_reason`);
- it is added only when **both** persons are mapped to members of the target Space;
- the garden tables purge when a partner joins or a membership ends, so the operator connects
  both persons in the target first and imports afterwards (``RUNBOOK.md``).

The tables stay in the Core migration chain, so they exist without the Pro plugin. They are
still handled only when they exist (:func:`available`), which keeps the tool correct against a
database that does not have them.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import MetaData, exists, inspect, select
from sqlalchemy.orm import Session

from eimir.core.errors import ErrorCode
from eimir.relationship.models import Membership, MembershipStatus
from eimir_pro.garden.models import MAX_STAGE, STORED_SPECIES, GardenVisitor, GardenWords
from eimir_pro.portability.allowlist import (
    ACCOUNT_ARRAY_COLUMNS,
    GARDEN_TABLES,
    account_columns,
)
from eimir_pro.portability.archive import TransferArchiveError
from eimir_pro.portability.common import _row_snake, _table, _uuid

# What the summary says about the garden of a bundle that carries one.
INCLUDED = "included"
SKIPPED_NOT_AVAILABLE = "skipped: this database has no garden tables"
SKIPPED_NOT_BOTH_PERSONS = (
    "skipped: both persons must be members of the target Space and mapped; "
    "connect them first, then import"
)
SKIPPED_NOT_EMPTY = "skipped: the target Space already has a garden"

_SMALLINT_MAX = 32767
_NAME_MAX = 40
_WORDS_MAX = 24


def available(session: Session) -> bool:
    """Whether the connected database has every garden table."""
    inspector = inspect(session.get_bind())
    return all(inspector.has_table(name) for name in GARDEN_TABLES)


def has_rows(tables: Mapping[str, list[dict[str, Any]]]) -> bool:
    return any(tables.get(name) for name in GARDEN_TABLES)


def without_garden(tables: Mapping[str, list[dict[str, Any]]]) -> dict[str, list[dict[str, Any]]]:
    """The same tables with every garden table left out."""
    return {name: rows for name, rows in tables.items() if name not in GARDEN_TABLES}


def _references(table_name: str, row: Mapping[str, Any]) -> Iterable[Any]:
    for column in account_columns(table_name):
        if row.get(column) is not None:
            yield row[column]
    for column in ACCOUNT_ARRAY_COLUMNS.get(table_name, ()):
        value = row.get(column)
        if isinstance(value, list):
            yield from value


def prune_export(session: Session, space_id: UUID, rows: dict[str, list[dict[str, Any]]]) -> None:
    """Leave the garden out of an export unless it refers only to active members.

    A garden is purged when a partner joins or a membership ends, so a stale row is not
    expected. If one exists anyway, a partial garden would be meaningless and the import
    would refuse it; the export then carries no garden at all, and its record counts show it.
    """
    if not any(rows.get(name) for name in GARDEN_TABLES):
        return
    active = set(
        session.execute(
            select(Membership.account_id).where(
                Membership.space_id == space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        ).scalars()
    )
    for name in GARDEN_TABLES:
        for row in rows.get(name, []):
            if any(reference not in active for reference in _references(name, row)):
                for table_name in GARDEN_TABLES:
                    rows[table_name] = []
                return


def _invalid() -> TransferArchiveError:
    return TransferArchiveError("Transfer garden is invalid.", ErrorCode.TRANSFER_RELATION_INVALID)


def _member(value: Any, members: set[UUID]) -> UUID:
    if value is None:
        raise _invalid()
    identifier = _uuid(value, ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID)
    if identifier not in members:
        raise TransferArchiveError(
            "Transfer member mapping is invalid.", ErrorCode.TRANSFER_MEMBER_MAPPING_INVALID
        )
    return identifier


def _code(value: Any, allowed: Iterable[str], *, nullable: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or value not in set(allowed):
        raise _invalid()
    return value


def _flag(value: Any) -> bool:
    if type(value) is not bool:
        raise _invalid()
    return value


def _integer(value: Any, *, low: int, high: int, nullable: bool = False) -> int | None:
    if value is None and nullable:
        return None
    if type(value) is not int or not low <= value <= high:
        raise _invalid()
    return value


def _day(value: Any, *, nullable: bool = False) -> date | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise _invalid()
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise _invalid() from None


def _moment(value: Any, *, nullable: bool = False) -> datetime | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str):
        raise _invalid()
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise _invalid() from None


def _name(value: Any) -> str:
    # ``btrim`` in the database check strips spaces only.
    if not isinstance(value, str) or not value.strip(" ") or len(value) > _NAME_MAX:
        raise _invalid()
    return value


def _unique(seen: set[Any], key: Any) -> None:
    if key in seen:
        raise _invalid()
    seen.add(key)


def validate_rows(
    tables: Mapping[str, list[dict[str, Any]]],
    source_members: set[UUID],
) -> None:
    """Check every garden row of the bundle against what the database would enforce.

    Raises before anything is inserted. The caller has already checked the shared basics
    (known columns, source Space, unique IDs, foreign keys); this adds the value rules of the
    garden constraints, so a hostile file fails with a clear refusal instead of a constraint
    violation halfway through the insert.
    """
    species_codes = [species.value for species in STORED_SPECIES]
    word_codes = [words.value for words in GardenWords]
    visitor_codes = [visitor.value for visitor in GardenVisitor]

    rows = {name: [_row_snake(raw) for raw in tables.get(name, [])] for name in GARDEN_TABLES}
    if len(rows["gardens"]) > 1:
        raise _invalid()
    for row in rows["gardens"]:
        _name(row.get("name"))
        _moment(row.get("updated_at"))

    plant_ids: set[UUID] = set()
    daily_seeds: set[Any] = set()
    bed_slots: set[Any] = set()
    for row in rows["garden_plants"]:
        plant_ids.add(_uuid(row.get("id"), ErrorCode.TRANSFER_RELATION_INVALID))
        sender = _member(row.get("sender_id"), source_members)
        receiver = _member(row.get("receiver_id"), source_members)
        if sender == receiver:
            raise _invalid()
        species = _code(row.get("species"), species_codes)
        _code(row.get("words"), word_codes, nullable=True)
        sent_on = _day(row.get("sent_on"))
        planted_at = _moment(row.get("planted_at"), nullable=True)
        slot = _integer(row.get("slot"), low=0, high=_SMALLINT_MAX, nullable=True)
        stage = _integer(row.get("stage"), low=0, high=MAX_STAGE)
        in_pond = _flag(row.get("in_pond"))
        bloomed = _flag(row.get("bloomed"))
        if _day(row.get("bloomed_on"), nullable=True) is not None and not bloomed:
            raise _invalid()
        # A seed has no slot and no growth; a plant has a slot.
        if (planted_at is None) != (slot is None) or (planted_at is None and stage != 0):
            raise _invalid()
        if in_pond != (species == "WATER_LILY"):
            raise _invalid()
        _unique(daily_seeds, (sender, sent_on))
        if slot is not None:
            _unique(bed_slots, (in_pond, slot))
        for column in ("created_at", "updated_at"):
            _moment(row.get(column), nullable=True)

    waterings: set[Any] = set()
    for row in rows["garden_waterings"]:
        account = _member(row.get("account_id"), source_members)
        if _uuid(row.get("plant_id"), ErrorCode.TRANSFER_RELATION_INVALID) not in plant_ids:
            raise _invalid()
        _unique(waterings, (account, _day(row.get("watered_on"))))

    readers: set[UUID] = set()
    for row in rows["garden_readers"]:
        _unique(readers, _member(row.get("account_id"), source_members))
        _integer(row.get("seen_shared_days"), low=0, high=_SMALLINT_MAX)

    animals: set[str] = set()
    for row in rows["garden_visitor_names"]:
        _unique(animals, _code(row.get("animal"), visitor_codes))
        _name(row.get("name"))
        _moment(row.get("updated_at"))

    daily_bouquets: set[Any] = set()
    for row in rows["garden_bouquets"]:
        giver = _member(row.get("giver_id"), source_members)
        receiver = _member(row.get("receiver_id"), source_members)
        if giver == receiver:
            raise _invalid()
        flowers, senders = row.get("flowers"), row.get("flower_senders")
        if (
            not isinstance(flowers, list)
            or not isinstance(senders, list)
            or not 1 <= len(flowers) <= 3
            or len(senders) != len(flowers)
        ):
            raise _invalid()
        for flower in flowers:
            _code(flower, species_codes)
        for sender in senders:
            _member(sender, source_members)
        closed_at = _moment(row.get("closed_at"), nullable=True)
        if _flag(row.get("kept")) and closed_at is None:
            raise _invalid()
        _unique(daily_bouquets, (giver, _day(row.get("given_on"))))
        for column in ("created_at", "updated_at"):
            _moment(row.get(column), nullable=True)


def skip_reason(session: Session, target_space: UUID, mapping: Mapping[UUID, UUID]) -> str | None:
    """Why the garden of the bundle is not added to the target Space, or ``None`` to add it."""
    if not available(session):
        return SKIPPED_NOT_AVAILABLE
    # Every member of the bundle is mapped (the import refuses otherwise); a garden needs
    # two distinct persons, each a member of the target Space.
    if len(set(mapping.values())) < 2:
        return SKIPPED_NOT_BOTH_PERSONS
    metadata = MetaData()
    for name in GARDEN_TABLES:
        table = _table(session, name, metadata)
        if session.scalar(select(exists().where(table.c.space_id == target_space))):
            return SKIPPED_NOT_EMPTY
    return None
