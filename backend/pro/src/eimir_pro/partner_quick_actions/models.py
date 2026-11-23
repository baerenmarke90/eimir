"""The extended partner gesture's receipt table (``partner.quick_actions.extended``).

Plugin-owned (Decision 0017): the in-tree Pro plugin names this module in
``model_modules()``, and Core knows the table only through its manifest row in
``eimir.plugins.manifest``. The gesture vocabulary (``SupportGestureKind``) stays
Core, because the shared notification pipeline and its projection use it.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin
from eimir.engagement.models import SupportGestureKind

_SUPPORT_GESTURE_KIND_VALUES = ", ".join(f"'{value.value}'" for value in SupportGestureKind)


class SupportGestureRequest(IdMixin, Base):
    """Idempotency/cooldown receipt for one content-free extended partner gesture."""

    __tablename__ = "support_gesture_requests"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    client_request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    source_event_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "sender_account_id <> recipient_account_id",
            name="support_gesture_sender_ne_recipient",
        ),
        CheckConstraint(
            f"kind IN ({_SUPPORT_GESTURE_KIND_VALUES})",
            name="support_gesture_kind_allowed",
        ),
        UniqueConstraint(
            "source_event_id",
            name="uq_support_gesture_requests_source_event_id",
        ),
        UniqueConstraint(
            "space_id",
            "sender_account_id",
            "kind",
            "client_request_id",
            name="uq_support_gesture_requests_sender_space_kind_client",
        ),
        Index(
            "ix_support_gesture_requests_sender_space_kind_created",
            "sender_account_id",
            "space_id",
            "kind",
            "created_at",
        ),
    )
