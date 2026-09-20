"""Persistence for instance-wide application administration state."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
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
    func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


class AdministrationSetting(StrEnum):
    """Auditable instance-wide boolean settings."""

    REGISTRATION_ENABLED = "registration_enabled"
    MAINTENANCE_MODE = "maintenance_mode"


class AdministrationAction(StrEnum):
    """Privacy-safe privileged actions recorded by ServerAdmin workflows."""

    ACCOUNT_SUSPENDED = "account_suspended"
    ACCOUNT_UNSUSPENDED = "account_unsuspended"
    ACCOUNT_SESSIONS_REVOKED = "account_sessions_revoked"
    ACCOUNT_EMAIL_VERIFIED = "account_email_verified"
    ACCOUNT_RECOVERY_EMAIL_REQUESTED = "account_recovery_email_requested"
    ACCOUNT_RECOVERY_ISSUED = "account_recovery_issued"
    SPACE_ENTITLEMENT_GRANTED = "space_entitlement_granted"
    SPACE_ENTITLEMENT_REVOKED = "space_entitlement_revoked"
    ACCOUNT_DELETION_REQUESTED = "account_deletion_requested"
    ACCOUNT_DELETION_COMPLETED = "account_deletion_completed"
    ACCOUNT_DELETION_FAILED = "account_deletion_failed"


class InstanceAdministrationSettings(TimestampMixin, VersionMixin, Base):
    """Singleton application-administration state.

    These settings are runtime product state. They are intentionally separate
    from deployment secrets and environment configuration.
    """

    __tablename__ = "instance_administration_settings"

    singleton_key: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    registration_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    __table_args__ = (
        CheckConstraint(
            "singleton_key = 1",
            name="singleton_key_is_one",
        ),
    )


class InstanceAdministrationEvent(IdMixin, Base):
    """Narrow audit history for privileged instance-setting changes."""

    __tablename__ = "instance_administration_events"

    actor_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )
    setting: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_value: Mapped[bool] = mapped_column(Boolean, nullable=False)
    new_value: Mapped[bool] = mapped_column(Boolean, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "setting IN ('registration_enabled', 'maintenance_mode')",
            name="setting_valid",
        ),
        Index("ix_instance_administration_events_created_at", "created_at"),
    )


class InstanceAdministrationActionEvent(IdMixin, Base):
    """Content-free audit history for privileged Account operations.

    The event deliberately stores only technical identifiers and an optional
    effect count. Authentication proofs, free-form reasons, user content, IP
    history, and other private payloads do not belong in this table.
    """

    __tablename__ = "instance_administration_action_events"

    actor_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )
    target_account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
    )
    target_space_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="SET NULL"),
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    effect_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "action IN ("
            "'account_suspended', "
            "'account_unsuspended', "
            "'account_sessions_revoked', "
            "'account_email_verified', "
            "'account_recovery_email_requested', "
            "'account_recovery_issued', "
            "'space_entitlement_granted', "
            "'space_entitlement_revoked', "
            "'account_deletion_requested', "
            "'account_deletion_completed', "
            "'account_deletion_failed'"
            ")",
            name="action_valid",
        ),
        Index("ix_instance_administration_action_events_created_at", "created_at"),
        Index("ix_instance_administration_action_events_target", "target_account_id"),
        Index(
            "ix_instance_administration_action_events_target_space",
            "target_space_id",
        ),
    )
