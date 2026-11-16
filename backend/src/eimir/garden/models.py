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

from collections.abc import Iterable
from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin

MAX_STAGE = 3


# SURPRISE exists only on the wire: a wrapped seed is stored as the MOONFLOWER
# it becomes and shown as SURPRISE until it first blooms (#1907 H3).
class GardenSpecies(StrEnum):
    """What a seed becomes; a surprise is shown until its moonflower first blooms."""

    POPPY = "POPPY"
    BELLFLOWER = "BELLFLOWER"
    STARFLOWER = "STARFLOWER"
    SUNFLOWER = "SUNFLOWER"
    TULIP = "TULIP"
    WATER_LILY = "WATER_LILY"
    STRAWBERRY = "STRAWBERRY"
    MOONFLOWER = "MOONFLOWER"
    SURPRISE = "SURPRISE"


# Species a row may hold; a wrapped surprise is stored as the moonflower it becomes.
STORED_SPECIES = tuple(
    species for species in GardenSpecies if species is not GardenSpecies.SURPRISE
)


class GardenUnlock(StrEnum):
    """What appears in the garden after cumulative shared days (never reset)."""

    PATH = "PATH"
    POND = "POND"
    SUNFLOWER = "SUNFLOWER"
    TULIP = "TULIP"
    WATER_LILY = "WATER_LILY"
    BENCH = "BENCH"
    TREE = "TREE"
    MORE_ROOM = "MORE_ROOM"
    STRAWBERRY = "STRAWBERRY"
    BIRDHOUSE = "BIRDHOUSE"
    ROSE_ARCH = "ROSE_ARCH"
    SWING = "SWING"
    STREAM = "STREAM"
    EVEN_MORE_ROOM = "EVEN_MORE_ROOM"


class GardenForm(StrEnum):
    """The garden's overall form, named in the garden book."""

    BED = "BED"
    MEADOW = "MEADOW"
    GARDEN = "GARDEN"
    PARADISE = "PARADISE"


class GardenWords(StrEnum):
    """Fixed phrases a partner may attach to a seed; clients localize them."""

    THINKING_OF_YOU = "THINKING_OF_YOU"
    MISS_YOU = "MISS_YOU"
    LOOKING_FORWARD = "LOOKING_FORWARD"
    GOOD_NIGHT = "GOOD_NIGHT"
    FOR_YOU = "FOR_YOU"


def _allowed(column: str, values: Iterable[StrEnum]) -> str:
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
    # Water lilies live in the pond and have their own slots there.
    in_pond: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # Set the first time the plant blooms: it reveals a surprise and fills the
    # garden book, and it stays set when the flower is given in a bouquet.
    bloomed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    __table_args__ = (
        UniqueConstraint("space_id", "sender_id", "sent_on", name="uq_garden_plants_daily_seed"),
        UniqueConstraint("space_id", "in_pond", "slot", name="uq_garden_plants_bed_slot"),
        CheckConstraint(_allowed("species", STORED_SPECIES), name="species_allowed"),
        CheckConstraint("in_pond = (species = 'WATER_LILY')", name="pond_holds_lilies"),
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


class Garden(Base):
    """The couple's garden name; the row exists only once someone named it."""

    __tablename__ = "gardens"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (CheckConstraint("length(btrim(name)) > 0", name="name_not_blank"),)


class GardenReader(Base):
    """How far each partner has seen the garden grow, so news shows once."""

    __tablename__ = "garden_readers"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    seen_shared_days: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

    __table_args__ = (CheckConstraint("seen_shared_days >= 0", name="seen_not_negative"),)


class GardenBouquet(IdMixin, TimestampMixin, Base):
    """Up to three blooms one partner picked and gave to the other."""

    __tablename__ = "garden_bouquets"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    giver_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    receiver_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    given_on: Mapped[date] = mapped_column(Date, nullable=False)
    # Species of each flower and who once sent its seed (for its colour).
    flowers: Mapped[list[str]] = mapped_column(postgresql.ARRAY(String(16)), nullable=False)
    flower_senders: Mapped[list[UUID]] = mapped_column(
        postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    kept: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    __table_args__ = (
        UniqueConstraint("space_id", "giver_id", "given_on", name="uq_garden_bouquets_daily"),
        CheckConstraint("giver_id <> receiver_id", name="giver_is_not_receiver"),
        CheckConstraint("cardinality(flowers) BETWEEN 1 AND 3", name="flowers_bounded"),
        CheckConstraint(
            "cardinality(flower_senders) = cardinality(flowers)", name="senders_match_flowers"
        ),
        CheckConstraint(
            "flowers <@ ARRAY["
            + ", ".join(repr(species.value) for species in STORED_SPECIES)
            + "]::varchar[]",
            name="flowers_allowed",
        ),
        CheckConstraint("kept = false OR closed_at IS NOT NULL", name="kept_is_closed"),
    )
