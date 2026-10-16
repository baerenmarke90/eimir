"""Persistence for the server-authoritative Account deletion lifecycle."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base


class AccountDeletionStatus(StrEnum):
    """Runtime progress after an external deletion tombstone was accepted."""

    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class DeletionConfirmationMailStatus(StrEnum):
    """PII-free best-effort confirmation-mail state."""

    CLAIMED = "CLAIMED"
    SENT = "SENT"
    UNAVAILABLE = "UNAVAILABLE"
    FAILED = "FAILED"
    NO_VERIFIED_PRIMARY = "NO_VERIFIED_PRIMARY"


class AccountDeletion(Base):
    """Database-side progress for one irreversibly accepted Account deletion.

    This row is intentionally not the restore authority. The forward-only
    reconciliation journal defined by #520 lives outside a point-in-time
    application database backup. This row records local progress after that
    journal has already accepted the tombstone.
    """

    __tablename__ = "account_deletions"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    failed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_failure_code: Mapped[str | None] = mapped_column(String(64))
    confirmation_mail_attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmation_mail_status: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('PENDING', 'COMPLETED', 'FAILED')",
            name="status_is_known",
        ),
        CheckConstraint(
            "(status = 'PENDING' AND completed_at IS NULL AND failed_at IS NULL "
            "AND last_failure_code IS NULL) OR "
            "(status = 'COMPLETED' AND completed_at IS NOT NULL AND failed_at IS NULL "
            "AND last_failure_code IS NULL) OR "
            "(status = 'FAILED' AND completed_at IS NULL AND failed_at IS NOT NULL "
            "AND last_failure_code IS NOT NULL)",
            name="status_matches_timestamps",
        ),
        CheckConstraint(
            "(confirmation_mail_attempted_at IS NULL AND confirmation_mail_status IS NULL) OR "
            "(confirmation_mail_attempted_at IS NOT NULL AND confirmation_mail_status IN "
            "('CLAIMED', 'SENT', 'UNAVAILABLE', 'FAILED', 'NO_VERIFIED_PRIMARY'))",
            name="confirmation_mail_state_is_valid",
        ),
        Index("ix_account_deletions_status_updated_at", "status", "updated_at"),
    )
