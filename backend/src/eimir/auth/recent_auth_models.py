"""Persistence owned exclusively by the recent-authentication boundary.

Normal sign-in WebAuthn challenges and OIDC requests deliberately stay in their
existing tables. Step-up ceremonies use separate state so a recent-auth flow
cannot be confused with ordinary authentication or identity linking.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin


class RecentAuthenticationGrant(IdMixin, Base):
    """Short-lived server authority for one Account/session/purpose tuple."""

    __tablename__ = "recent_auth_grants"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_session_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("device_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(64), nullable=False)
    method: Mapped[str] = mapped_column(String(32), nullable=False)
    achieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "device_session_id",
            "purpose",
            name="uq_recent_auth_grants_context",
        ),
        CheckConstraint(
            "method IN ('LOCAL_PASSWORD', 'PASSKEY', 'OIDC')",
            name="method_known",
        ),
        CheckConstraint("expires_at > achieved_at", name="expiry_after_achievement"),
        Index("ix_recent_auth_grants_expires_at", "expires_at"),
        Index("ix_recent_auth_grants_device_session_id", "device_session_id"),
    )


class RecentAuthenticationWebAuthnChallenge(IdMixin, Base):
    """One-shot WebAuthn challenge bound to one step-up context."""

    __tablename__ = "recent_auth_webauthn"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_session_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("device_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(64), nullable=False)
    challenge: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("ix_recent_auth_webauthn_expires_at", "expires_at"),
        Index("ix_recent_auth_webauthn_context", "account_id", "device_session_id"),
    )


class RecentAuthenticationOidcRequest(IdMixin, Base):
    """One OIDC reauthentication request, isolated from ordinary OIDC login."""

    __tablename__ = "recent_auth_oidc"

    connection_id: Mapped[str] = mapped_column(String(64), nullable=False)
    state_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(512), nullable=False)
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    device_session_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("device_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    purpose: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("state_hash", name="uq_recent_auth_oidc_state_hash"),
        Index("ix_recent_auth_oidc_expires_at", "expires_at"),
        Index("ix_recent_auth_oidc_context", "account_id", "device_session_id"),
    )
