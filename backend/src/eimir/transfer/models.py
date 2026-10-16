"""Persistence for versioned user portability transfers."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class TransferScope(StrEnum):
    SHARED = "SHARED"
    PERSONAL = "PERSONAL"


class ExportStatus(StrEnum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    READY = "READY"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


class ImportStatus(StrEnum):
    QUEUED = "QUEUED"
    VALIDATING = "VALIDATING"
    READY_TO_APPLY = "READY_TO_APPLY"
    APPLYING = "APPLYING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


class TransferExport(IdMixin, TimestampMixin, Base):
    """One creator-bound, temporary generated export archive."""

    __tablename__ = "transfer_exports"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    scope: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ExportStatus.QUEUED.value
    )
    job_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    artifact_size: Mapped[int | None] = mapped_column(BigInteger)
    error_code: Mapped[str | None] = mapped_column(String(64))
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("scope IN ('SHARED', 'PERSONAL')", name="scope_is_known"),
        CheckConstraint(
            "status IN ('QUEUED', 'RUNNING', 'READY', 'FAILED', 'EXPIRED')",
            name="status_is_known",
        ),
        CheckConstraint("artifact_size IS NULL OR artifact_size >= 0", name="size_is_non_negative"),
        Index("ix_transfer_exports_creator", "space_id", "created_by", "created_at"),
        Index("ix_transfer_exports_expiry", "status", "expires_at"),
    )


class TransferImport(IdMixin, TimestampMixin, Base):
    """One staged archive and its validation/apply lifecycle."""

    __tablename__ = "transfer_imports"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(
        String(24), nullable=False, default=ImportStatus.QUEUED.value
    )
    scope: Mapped[str | None] = mapped_column(String(16))
    source_space_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    source_owner_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    member_mapping: Mapped[dict[str, str] | None] = mapped_column(postgresql.JSONB)
    validation_job_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    apply_job_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    summary: Mapped[dict[str, object] | None] = mapped_column(postgresql.JSONB)
    artifact_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64))
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint("scope IS NULL OR scope IN ('SHARED', 'PERSONAL')", name="scope_is_known"),
        CheckConstraint(
            "status IN ('QUEUED', 'VALIDATING', 'READY_TO_APPLY', 'APPLYING', "
            "'COMPLETED', 'FAILED', 'EXPIRED')",
            name="status_is_known",
        ),
        CheckConstraint("artifact_size >= 0", name="size_is_non_negative"),
        Index("ix_transfer_imports_creator", "space_id", "created_by", "created_at"),
        Index("ix_transfer_imports_expiry", "status", "expires_at"),
    )
