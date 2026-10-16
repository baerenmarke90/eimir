"""System metadata for M4-C Rule preferences and Reminder occurrences."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
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
from eimir.db.mixins import IdMixin, TimestampMixin


class OccurrenceState(StrEnum):
    PENDING = "PENDING"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"
    SUPERSEDED = "SUPERSEDED"
    EXPIRED = "EXPIRED"


class RulePreference(IdMixin, TimestampMixin, Base):
    __tablename__ = "rule_preferences"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    rule_key: Mapped[str] = mapped_column(String(96), nullable=False)
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    parameters: Mapped[dict[str, Any]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )

    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "space_id",
            "rule_key",
            name="uq_rule_preferences_account_space_rule",
        ),
        Index("ix_rule_preferences_space_account", "space_id", "account_id"),
    )


class ReminderOccurrence(IdMixin, Base):
    __tablename__ = "reminder_occurrences"

    reminder_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("reminders.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    occurrence_key: Mapped[str] = mapped_column(String(128), nullable=False)
    days_before: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    state: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=OccurrenceState.PENDING.value,
    )
    generation: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "days_before BETWEEN 0 AND 365",
            name="reminder_occurrence_days_before_range",
        ),
        CheckConstraint(
            "state IN ('PENDING', 'DELIVERED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED')",
            name="reminder_occurrence_state_allowed",
        ),
        CheckConstraint(
            "generation >= 1",
            name="reminder_occurrence_generation_positive",
        ),
        UniqueConstraint(
            "reminder_id",
            "recipient_account_id",
            "occurrence_key",
            "days_before",
            name="uq_reminder_occurrences_logical",
        ),
        Index(
            "ix_reminder_occurrences_recipient_state_due",
            "recipient_account_id",
            "state",
            "due_at",
        ),
        Index(
            "ix_reminder_occurrences_reminder_state_due",
            "reminder_id",
            "state",
            "due_at",
        ),
    )
