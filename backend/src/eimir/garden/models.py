"""Seeds, plants and the daily watering gesture of the shared garden.

A seed is one row: it is sent on a local calendar day, waits for the partner
and becomes a plant once it is planted (or automatically the next day). Every
plant grows one stage on a day both partners sent a seed. Nothing ever withers
and there is no streak: missing days change nothing.

The rows hold only closed codes (species, words), dates, stages, slots and the
two partners' account ids. They never store a location, a distance or the
messenger shown during the flight; the reading device derives that from the
existing distance projection.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin

MAX_STAGE = 3


class GardenSpecies(StrEnum):
    POPPY = "POPPY"
    BELLFLOWER = "BELLFLOWER"
    STARFLOWER = "STARFLOWER"


class GardenWords(StrEnum):
    """Fixed phrases a partner may attach to a seed; clients localize them."""

    THINKING_OF_YOU = "THINKING_OF_YOU"
    MISS_YOU = "MISS_YOU"
    LOOKING_FORWARD = "LOOKING_FORWARD"
    GOOD_NIGHT = "GOOD_NIGHT"
    FOR_YOU = "FOR_YOU"


def _allowed(column: str, values: type[StrEnum]) -> str:
    return f"{column} IN ({', '.join(repr(value.value) for value in values)})"


class GardenPlant(IdMixin, TimestampMixin, Base):
    """A seed one partner sent to the other; a plant once it is in the ground."""

    __tablename__ = "garden_plants"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    receiver_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    species: Mapped[str] = mapped_column(String(16), nullable=False)
    words: Mapped[str | None] = mapped_column(String(24), nullable=True)
    sent_on: Mapped[date] = mapped_column(Date, nullable=False)
    planted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Position in the garden, assigned when the seed is planted.
    slot: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    stage: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("space_id", "sender_id", "sent_on", name="uq_garden_plants_daily_seed"),
        UniqueConstraint("space_id", "slot", name="uq_garden_plants_slot"),
        CheckConstraint(_allowed("species", GardenSpecies), name="species_allowed"),
        CheckConstraint(f"words IS NULL OR {_allowed('words', GardenWords)}", name="words_allowed"),
        CheckConstraint(f"stage BETWEEN 0 AND {MAX_STAGE}", name="stage_bounded"),
        CheckConstraint("sender_id <> receiver_id", name="sender_is_not_receiver"),
        CheckConstraint(
            "(planted_at IS NULL AND slot IS NULL AND stage = 0)"
            " OR (planted_at IS NOT NULL AND slot IS NOT NULL AND slot >= 0)",
            name="planted_has_slot",
        ),
    )


class GardenWatering(IdMixin, Base):
    """One watering gesture per partner and local day; it never changes growth."""

    __tablename__ = "garden_waterings"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    plant_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("garden_plants.id", ondelete="CASCADE"),
        nullable=False,
    )
    watered_on: Mapped[date] = mapped_column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint("space_id", "account_id", "watered_on", name="uq_garden_waterings_daily"),
    )
