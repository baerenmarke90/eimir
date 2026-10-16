"""Persistence for M4-C Reminder definitions and recipient preferences."""

from __future__ import annotations

from datetime import datetime, time
from enum import StrEnum
from typing import ClassVar
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
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class ReminderSource(StrEnum):
    MANUAL = "MANUAL"
    GENERATED = "GENERATED"


class ReminderScheduleType(StrEnum):
    ONCE = "ONCE"
    ANNUAL = "ANNUAL"
    RELATIONSHIP_DAY_COUNT = "RELATIONSHIP_DAY_COUNT"


def reminder_source_type() -> SqlEnum:
    return SqlEnum(
        *(value.value for value in ReminderSource),
        name="reminder_source",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


def reminder_schedule_type() -> SqlEnum:
    return SqlEnum(
        *(value.value for value in ReminderScheduleType),
        name="reminder_schedule_type",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


class ReminderPayload(ProtectedPayload):
    title: str
    description: str | None = None


class Reminder(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A shared Reminder definition; ``owner_id`` is creation provenance only."""

    __tablename__ = "reminders"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Reminder not found.", "REMINDER_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    source: Mapped[str] = mapped_column(
        reminder_source_type(),
        nullable=False,
        default=ReminderSource.MANUAL.value,
        server_default=text("'MANUAL'"),
    )
    source_type: Mapped[str | None] = mapped_column(String(64))
    source_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    rule_key: Mapped[str | None] = mapped_column(String(96))

    schedule_type: Mapped[str] = mapped_column(reminder_schedule_type(), nullable=False)
    once_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    annual_month: Mapped[int | None] = mapped_column(SmallInteger)
    annual_day: Mapped[int | None] = mapped_column(SmallInteger)
    local_time: Mapped[time | None] = mapped_column(Time(timezone=False))
    relationship_day_count: Mapped[int | None] = mapped_column(Integer)

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[ReminderPayload] = mapped_column(
        ProtectedPayloadJSON(ReminderPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="reminder_privacy_is_shared"),
        CheckConstraint("crypto_version >= 0", name="reminder_crypto_version_non_negative"),
        CheckConstraint(
            "(source = 'MANUAL' AND source_type IS NULL AND source_id IS NULL "
            "AND rule_key IS NULL) "
            "OR (source = 'GENERATED' AND source_type IS NOT NULL AND source_id IS NOT NULL "
            "AND rule_key IS NOT NULL)",
            name="reminder_source_fields_valid",
        ),
        CheckConstraint(
            "(schedule_type = 'ONCE' AND once_at IS NOT NULL AND annual_month IS NULL "
            "AND annual_day IS NULL AND local_time IS NULL AND relationship_day_count IS NULL) "
            "OR (schedule_type = 'ANNUAL' AND once_at IS NULL AND annual_month IS NOT NULL "
            "AND annual_day IS NOT NULL AND local_time IS NOT NULL "
            "AND relationship_day_count IS NULL) "
            "OR (schedule_type = 'RELATIONSHIP_DAY_COUNT' AND once_at IS NULL "
            "AND annual_month IS NULL AND annual_day IS NULL AND local_time IS NOT NULL "
            "AND relationship_day_count IS NOT NULL)",
            name="reminder_schedule_fields_valid",
        ),
        CheckConstraint(
            "annual_month IS NULL OR annual_month BETWEEN 1 AND 12",
            name="reminder_annual_month_range",
        ),
        CheckConstraint(
            "annual_day IS NULL OR annual_day BETWEEN 1 AND 31",
            name="reminder_annual_day_range",
        ),
        CheckConstraint(
            "relationship_day_count IS NULL OR relationship_day_count >= 1",
            name="reminder_relationship_day_count_positive",
        ),
        UniqueConstraint("id", "space_id", name="uq_reminders_id_space_id"),
        UniqueConstraint(
            "space_id",
            "source_type",
            "source_id",
            "rule_key",
            name="uq_reminders_generated_identity",
        ),
        Index("ix_reminders_space_created_id", "space_id", "created_at", "id"),
        Index("ix_reminders_space_source", "space_id", "source"),
    )


def shared_privacy() -> PrivacyClass:
    return PrivacyClass.SPACE_SHARED


class ReminderOffset(IdMixin, Base):
    __tablename__ = "reminder_offsets"

    reminder_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("reminders.id", ondelete="CASCADE"),
        nullable=False,
    )
    days_before: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "days_before BETWEEN 0 AND 365",
            name="reminder_offset_days_before_range",
        ),
        UniqueConstraint(
            "reminder_id",
            "days_before",
            name="uq_reminder_offsets_reminder_days",
        ),
        Index("ix_reminder_offsets_reminder_days", "reminder_id", "days_before"),
    )


class ReminderPreference(IdMixin, TimestampMixin, Base):
    __tablename__ = "reminder_preferences"

    reminder_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("reminders.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    muted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )

    __table_args__ = (
        UniqueConstraint(
            "reminder_id",
            "account_id",
            name="uq_reminder_preferences_reminder_account",
        ),
        Index("ix_reminder_preferences_account", "account_id", "reminder_id"),
    )
