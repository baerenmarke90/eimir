"""Shared request-identity receipt for idempotent create endpoints.

Generalizes the Memory-specific receipt (decision 0012, #961,
``eimir.memories.create_receipts``) for domains whose create flow has no
other reconciliation primitive yet. Memory keeps its own FK-backed
``MemoryCreateReceipt`` unchanged; this table is for later adopters
(Comment, Wish, Plan, Milestone, HeartMoment) so each does not hand-roll a
near-identical table of its own.

One ``resource_type`` column serves several unrelated content tables, so a
single foreign key cannot express the reference the way Memory's own
``memory_id`` column does. ``resource_id`` is therefore a plain column: a row
that outlives its resource is expected, and ``create_receipts.service.replay``
resolves it through ``readable()`` and reports "not found" as "deleted",
exactly like the FK-backed Memory receipt's ``ON DELETE SET NULL`` case.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin


class CreateReceiptResourceType(StrEnum):
    """Closed catalog of domains sharing this receipt table.

    A shipped value is never renamed; a new adopter appends a value here.
    """

    COMMENT = "COMMENT"
    WISH = "WISH"
    PLAN = "PLAN"
    MILESTONE = "MILESTONE"
    HEART_MOMENT = "HEART_MOMENT"


_RESOURCE_TYPE_VALUES = ", ".join(f"'{value.value}'" for value in CreateReceiptResourceType)


class CreateReceipt(IdMixin, Base):
    """Technical receipt tying one request identity to the resource it created.

    The receipt is written in the same transaction as the resource, so it
    exists exactly when the create committed. It deliberately stores no
    request content: only a fingerprint used to detect identity reuse with a
    different payload. Rows are bounded in lifetime (see
    ``create_receipts.service``).
    """

    __tablename__ = "create_receipts"

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
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False)
    idempotency_key: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    # NULL while the creating transaction is still open, and afterwards when
    # the resource has been deleted (no FK; see module docstring).
    resource_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "space_id",
            "account_id",
            "resource_type",
            "idempotency_key",
            name="uq_create_receipts_identity",
        ),
        CheckConstraint(
            f"resource_type IN ({_RESOURCE_TYPE_VALUES})",
            name="create_receipt_resource_type_allowed",
        ),
        CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name="create_receipt_fingerprint_is_sha256_hex",
        ),
        Index("ix_create_receipts_created_at", "created_at"),
    )
