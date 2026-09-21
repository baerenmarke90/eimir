"""Persistence for the shared current-day Daily Check-in.

A DailyCheckIn is ephemeral relationship context. Vibe and Energy are optional
fields of the same record; the final empty dimension is never persisted. The
Vibe product value catalog is intentionally still undecided, so this foundation
reserves the column while a database constraint keeps it null until #429 owns
the explicit typed values.
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


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

    # #429 deliberately has no accepted V1 product enum yet. Keep this column
    # reserved for the shared record shape without accepting arbitrary strings.
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
            "vibe IS NULL",
            name="vibe_contract_pending",
        ),
        CheckConstraint(
            "energy_level IS NULL OR "
            "(energy_level >= 10 AND energy_level <= 100 AND energy_level % 10 = 0)",
            name="energy_level_is_step",
        ),
        Index("ix_daily_check_ins_space_day", "space_id", "checked_on"),
    )
