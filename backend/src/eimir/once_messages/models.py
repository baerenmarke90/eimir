"""Temporary ciphertext, public device keys and explicit reception consent."""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar
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
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass
from eimir.db.base import Base
from eimir.db.mixins import IdMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class OnceReception(Base):
    __tablename__ = "once_receptions"

    space_id: Mapped[UUID] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), primary_key=True
    )
    account_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), primary_key=True
    )
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id", ondelete="CASCADE"))
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )


class OnceDevice(Base):
    __tablename__ = "once_devices"

    id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    space_id: Mapped[UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    membership_id: Mapped[UUID] = mapped_column(ForeignKey("memberships.id", ondelete="CASCADE"))
    public_jwk: Mapped[dict[str, Any]] = mapped_column(postgresql.JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class OnceEnvelope(ProtectedPayload):
    """An opaque JWE only. A server-known at-rest key never decrypts its content."""

    jwe: dict[str, Any]


class OnceMessage(IdMixin, Base):
    __tablename__ = "once_messages"
    privacy_class: ClassVar[str] = PrivacyClass.TEMPORARY_SHARED.value

    space_id: Mapped[UUID] = mapped_column(ForeignKey("spaces.id", ondelete="CASCADE"))
    sender_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    recipient_id: Mapped[UUID] = mapped_column(ForeignKey("accounts.id", ondelete="CASCADE"))
    sender_membership_id: Mapped[UUID] = mapped_column(
        ForeignKey("memberships.id", ondelete="CASCADE")
    )
    recipient_membership_id: Mapped[UUID] = mapped_column(
        ForeignKey("memberships.id", ondelete="CASCADE")
    )
    request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default=text("0")
    )
    payload: Mapped[OnceEnvelope] = mapped_column(
        ProtectedPayloadJSON(OnceEnvelope), nullable=False
    )
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claim_hash: Mapped[str | None] = mapped_column(String(64))
    claim_device_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    claim_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("sender_id <> recipient_id", name="once_distinct_partners"),
        CheckConstraint("byte_size >= 0 AND byte_size <= 16777216", name="once_byte_bound"),
        Index("uq_once_message_request", "space_id", "sender_id", "request_id", unique=True),
        Index("ix_once_inbox", "space_id", "recipient_id", "expires_at"),
        Index("ix_once_expiry", "expires_at"),
    )
