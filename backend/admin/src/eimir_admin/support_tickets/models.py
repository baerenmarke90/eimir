"""The link between a support report and its tracker ticket (#2189, design section 5.4).

The operator plugin owns this table; Core knows it only through the plugin
manifest. The row cascades with its report, so retention and account deletion
of the report need no rule of their own. The ticket holds no report content:
the tracker, the link and the state only.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin


class TicketState(StrEnum):
    PENDING = "PENDING"
    """The ticket is being created; a retry may find this row and finish it."""
    CREATED = "CREATED"
    """The tracker accepted the ticket; ``url`` and ``number`` are set."""


_STATE_VALUES = ", ".join(f"'{value.value}'" for value in TicketState)


class SupportReportTicket(IdMixin, Base):
    """The one tracker ticket of a support report."""

    __tablename__ = "support_report_tickets"

    report_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("support_reports.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    tracker: Mapped[str] = mapped_column(String(32), nullable=False)
    url: Mapped[str | None] = mapped_column(String(512))
    number: Mapped[int | None] = mapped_column(Integer)
    state: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (CheckConstraint(f"state IN ({_STATE_VALUES})", name="state_allowed"),)
