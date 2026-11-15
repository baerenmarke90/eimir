"""Evidence that an Account accepted a specific version of the terms of use."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin


class TermsAcceptanceOrigin(StrEnum):
    """Where the person gave the acceptance."""

    SIGNUP_REQUEST = "signup_request"
    """In the signup form, before the mailed proof was requested."""

    SIGNUP_REDEMPTION = "signup_redemption"
    """While redeeming a proof that carried no current acceptance."""


class TermsAcceptance(IdMixin, Base):
    """One accepted version of the eimir. Cloud terms of use for one Account.

    Rows are append-only contract evidence: a later version adds a row instead
    of overwriting the earlier one. They hold no content, address, network or
    device data. Account deletion removes them with the other Account-owned
    authentication records.
    """

    __tablename__ = "terms_acceptances"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    accepted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    origin: Mapped[str] = mapped_column(String(32), nullable=False)

    __table_args__ = (
        UniqueConstraint("account_id", "version"),
        CheckConstraint(
            "origin IN ('signup_request', 'signup_redemption')",
            name="origin_is_known",
        ),
    )
