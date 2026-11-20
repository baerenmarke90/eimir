"""Persistence for the shared current-day Daily Check-in.

A DailyCheckIn is ephemeral relationship context. Vibe and Energy are optional
fields of the same record; the final empty dimension is never persisted. Vibe
uses the explicit #429 V1 product catalog; Energy uses the #431 ten-point scale.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Any, Self
from uuid import UUID

from pydantic import Field, field_validator, model_validator
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

    VERY_GOOD = "VERY_GOOD"
    GOOD = "GOOD"
    OKAY = "OKAY"
    STRESSED = "STRESSED"
    SAD = "SAD"
    NEEDS_CONNECTION = "NEEDS_CONNECTION"
    NEEDS_SPACE = "NEEDS_SPACE"


class RecommendationKey(StrEnum):
    QUIET_TIME = "quiet_time"
    SMALL_PLAN = "small_plan"
    APPRECIATION = "appreciation"
    LISTENING = "listening"
    OWN_PACE = "own_pace"
    KEEP_RITUAL = "keep_ritual"


class RecommendationRating(StrEnum):
    HELPFUL = "HELPFUL"
    NOT_FITTING = "NOT_FITTING"


class DailyInsightFeedback(IdMixin, TimestampMixin, Base):
    """Bounded caller-owned preferences; never stores check-in data or model prose."""

    __tablename__ = "daily_insight_feedback"
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    recommendation_key: Mapped[str] = mapped_column(String(32), nullable=False)
    rating: Mapped[str] = mapped_column(String(16), nullable=False)
    __table_args__ = (
        UniqueConstraint(
            "space_id",
            "account_id",
            "recommendation_key",
            name="uq_daily_insight_feedback_owner_key",
        ),
        CheckConstraint(
            "recommendation_key IN ('quiet_time','small_plan','appreciation',"
            "'listening','own_pace','keep_ritual')",
            name="recommendation_is_known",
        ),
        CheckConstraint("rating IN ('HELPFUL','NOT_FITTING')", name="rating_is_known"),
    )


class DailyVibeNotePayload(ProtectedPayload):
    """Short user-authored context attached to one current-day Vibe."""

    note: str = Field(min_length=1, max_length=200)


class DailyCheckInPayload(ProtectedPayload):
    """The two values of a check-in: how a person felt and how much energy they had.

    They were plain columns until the Product Owner decision of 2026-11-16
    (#797): a database dump showed a couple's mood day by day. The value rules
    the column checks enforced are kept here.
    """

    vibe: str | None = None
    energy_level: int | None = Field(default=None, ge=10, le=100, multiple_of=10)

    @field_validator("vibe")
    @classmethod
    def vibe_is_known(cls, value: str | None) -> str | None:
        if value is not None:
            DailyVibe(value)  # raises ValueError for anything outside the catalog
        return value

    @model_validator(mode="after")
    def has_a_value(self) -> Self:
        # The final empty dimension is never persisted; such a check-in is deleted.
        if self.vibe is None and self.energy_level is None:
            raise ValueError("A check-in needs a vibe or an energy level.")
        return self


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

    # Legacy plaintext home of the two values. New writes keep these NULL and
    # store the values in ``payload``; a row written before that still carries
    # them here until the column backfill (``eimir.security.column_moves``) has
    # visited it. Read ``vibe`` and ``energy_level`` below, never these.
    legacy_vibe: Mapped[str | None] = mapped_column("vibe", String(32))
    legacy_energy_level: Mapped[int | None] = mapped_column("energy_level", Integer)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    # NULL only on a row not yet backfilled; see ``ProtectedPayloadJSON.optional``.
    payload: Mapped[DailyCheckInPayload | None] = mapped_column(
        ProtectedPayloadJSON(DailyCheckInPayload, optional=True)
    )

    def __init__(
        self, *, vibe: str | None = None, energy_level: int | None = None, **values: Any
    ) -> None:
        """Accept the two values by name and store them in the payload."""
        if "payload" not in values and (vibe is not None or energy_level is not None):
            values["payload"] = DailyCheckInPayload(vibe=vibe, energy_level=energy_level)
        super().__init__(**values)

    @property
    def vibe(self) -> str | None:
        """The vibe, from the protected payload or, for a legacy row, its column."""
        return self.payload.vibe if self.payload is not None else self.legacy_vibe

    @vibe.setter
    def vibe(self, value: str | None) -> None:
        self.set_values(vibe=value, energy_level=self.energy_level)

    @property
    def energy_level(self) -> int | None:
        """The energy level, from the protected payload or, for a legacy row, its column."""
        return self.payload.energy_level if self.payload is not None else self.legacy_energy_level

    @energy_level.setter
    def energy_level(self, value: int | None) -> None:
        self.set_values(vibe=self.vibe, energy_level=value)

    def set_values(self, *, vibe: str | None, energy_level: int | None) -> None:
        """Replace both values; the payload is their only home from here on."""
        self.payload = DailyCheckInPayload(vibe=vibe, energy_level=energy_level)
        self.legacy_vibe = None
        self.legacy_energy_level = None

    __table_args__ = (
        UniqueConstraint(
            "space_id",
            "account_id",
            "checked_on",
            name="uq_daily_check_ins_space_account_day",
        ),
        # A row holds its values in the payload or, until it is backfilled, in the
        # legacy columns. A row with neither is not a check-in; the payload model
        # in turn refuses to be empty.
        CheckConstraint(
            "payload IS NOT NULL OR vibe IS NOT NULL OR energy_level IS NOT NULL",
            name="has_dimension",
        ),
        CheckConstraint(
            "vibe IS NULL OR vibe IN "
            "('VERY_GOOD', 'GOOD', 'OKAY', 'STRESSED', 'SAD', 'NEEDS_CONNECTION', 'NEEDS_SPACE')",
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
        index=True,
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
            name="crypto_version_is_non_negative",
        ),
    )
