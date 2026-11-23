"""Persistence for support reports and their single reply (#2189).

A report belongs to the reporter's Account, not to a Space. The reply lives in
its own table because the encryption-at-rest tooling handles exactly one
protected ``payload`` column (with its ``crypto_version``) per table; the
unique ``report_id`` keeps it to one reply per report.
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
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT
from eimir.support_reports.payload import SupportReportPayload, SupportReportReply


class SupportReportKind(StrEnum):
    PROBLEM = "PROBLEM"
    FEEDBACK = "FEEDBACK"


class SupportReportState(StrEnum):
    """The operator's own triage marker; a reply never changes it."""

    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    CLOSED = "CLOSED"


_KIND_VALUES = ", ".join(f"'{value.value}'" for value in SupportReportKind)
_STATE_VALUES = ", ".join(f"'{value.value}'" for value in SupportReportState)


class SupportReport(IdMixin, Base):
    """One problem report or feedback from a signed-in person."""

    __tablename__ = "support_reports"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    client_request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    state: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=SupportReportState.NEW.value,
        server_default=text("'NEW'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[SupportReportPayload] = mapped_column(
        ProtectedPayloadJSON(SupportReportPayload),
        nullable=False,
    )

    __table_args__ = (
        # Offline retries of one client request never create a second report.
        UniqueConstraint("account_id", "client_request_id"),
        CheckConstraint(f"kind IN ({_KIND_VALUES})", name="kind_allowed"),
        CheckConstraint(f"state IN ({_STATE_VALUES})", name="state_allowed"),
        CheckConstraint(
            "(state = 'CLOSED') = (closed_at IS NOT NULL)", name="closed_at_matches_state"
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index("ix_support_reports_state_created_at_id", "state", "created_at", "id"),
        Index("ix_support_reports_created_at", "created_at"),
    )


class SupportReportReplyRow(IdMixin, Base):
    """The operator's single reply to one report; deleted with the report."""

    __tablename__ = "support_report_replies"

    report_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("support_reports.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    replied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[SupportReportReply] = mapped_column(
        ProtectedPayloadJSON(SupportReportReply),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
