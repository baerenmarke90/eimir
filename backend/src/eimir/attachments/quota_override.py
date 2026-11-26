"""An individual Cloud storage quota for one Space (ServerAdmin part 3, #2324).

A ServerAdmin may set a quota that replaces the tier value (Free or Premium)
for one Space, higher or lower, optionally until a date. Afterwards the tier
value applies again by itself; no job is needed. Over any quota nothing is
deleted; only new bytes are refused. Self-Hosted is unmetered and ignores it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, Session, mapped_column

from eimir.db.base import Base

GIGABYTE = 1024**3
MIN_QUOTA_GB = 1
MAX_QUOTA_GB = 1024


class SpaceStorageQuotaOverride(Base):
    __tablename__ = "space_storage_quota_overrides"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    quota_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    set_by_account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    set_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (CheckConstraint("quota_bytes > 0", name="quota_positive"),)


def active_override(
    session: Session, space_id: UUID, at: datetime
) -> SpaceStorageQuotaOverride | None:
    """The override that applies to the Space at ``at``, if any."""
    row = session.execute(
        select(SpaceStorageQuotaOverride).where(SpaceStorageQuotaOverride.space_id == space_id)
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.effective_until is not None and row.effective_until <= at:
        return None
    return row
