"""Persistence for the shared current-day Daily Check-in.

A DailyCheckIn is ephemeral relationship context. Vibe and Energy are optional
fields of the same record; the final empty dimension is never persisted. Vibe
uses the explicit #429 V1 product catalog; Energy uses the #431 ten-point scale.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class DailyVibe(StrEnum):
    """Stable V1 daily-state values owned by #429.

    These values describe today's relationship-facing state. They are not
    diagnoses, scores, or HeartMoment emotions; localized UI copy remains a
    presentation concern.
    """

    GOOD = "GOOD"
    OKAY = "OKAY"
    STRESSED = "STRESSED"
    SAD = "SAD"
    NEEDS_CONNECTION = "NEEDS_CONNECTION"
    NEEDS_SPACE = "NEEDS_SPACE"


class DailyVibeNotePayload(ProtectedPayload):
    """Short user-authored context attached to one current-day Vibe."""

    note: str = Field(min_length=1, max_length=200)


class DailyCheckIn(IdMixin, TimestampMixin, VersionMixin, Base):
    """One Account's optional Vibe/Energy dimensions for one authoritative Space day."""

    __tablename__ = "daily_check_ins"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    checked_on: Mapped[date] = mapped_column(Date, nullable=False)

    vibe: Mapped[str | None] = mapped_column(String(32))
    energy_level: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint(
            "space_id",
            "account_id",
            "checked_on",
            name="uq_daily_check_ins_space_account_day",
        ),
        CheckConstraint(
            "vibe IS NOT NULL OR energy_level IS NOT NULL",
            name="has_dimension",
        ),
        CheckConstraint(
            "vibe IS NULL OR vibe IN "
            "('GOOD', 'OKAY', 'STRESSED', 'SAD', 'NEEDS_CONNECTION', 'NEEDS_SPACE')",
            name="vibe_is_known",
        ),
        CheckConstraint(
            "energy_level IS NULL OR "
            "(energy_level >= 10 AND energy_level <= 100 AND energy_level % 10 = 0)",
            name="energy_level_is_step",
        ),
        Index("ix_daily_check_ins_space_day", "space_id", "checked_on"),
    )


class DailyCheckInVibeNote(IdMixin, TimestampMixin, Base):
    """Encrypted optional Vibe context owned by one DailyCheckIn aggregate."""

    __tablename__ = "daily_check_in_vibe_notes"

    daily_check_in_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("daily_check_ins.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[DailyVibeNotePayload] = mapped_column(
        ProtectedPayloadJSON(DailyVibeNotePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "crypto_version >= 0",
            name="daily_check_in_vibe_note_crypto_version_is_non_negative",
        ),
    )
