"""Persistence for owner-controlled partner location sharing (#1792, #1524).

``PartnerLocationConsent`` is the owner's purpose-bound sharing decision.
``PresenceSnapshot`` is the single short-lived, reduced-precision current
position per owner and Space. There is deliberately no history table.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class SharingLevel(StrEnum):
    OFF = "OFF"
    DISTANCE = "DISTANCE"
    DISTANCE_AND_MAP = "DISTANCE_AND_MAP"


class PartnerLocationConsent(IdMixin, TimestampMixin, Base):
    """One Account's sharing decision for its current partner in one Space."""

    __tablename__ = "partner_location_consents"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    recipient_account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=True,
    )
    level: Mapped[str] = mapped_column(String(24), nullable=False, default=SharingLevel.OFF.value)
    indefinite: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    generation: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default=text("1")
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "space_id", "account_id", name="uq_partner_location_consents_space_account"
        ),
        CheckConstraint("level IN ('OFF', 'DISTANCE', 'DISTANCE_AND_MAP')", name="level_is_known"),
        CheckConstraint(
            "level = 'OFF' OR recipient_account_id IS NOT NULL", name="active_has_recipient"
        ),
        CheckConstraint(
            "level = 'OFF' OR (indefinite AND expires_at IS NULL) "
            "OR (NOT indefinite AND expires_at IS NOT NULL)",
            name="duration_is_explicit",
        ),
        CheckConstraint("generation >= 1", name="generation_is_positive"),
    )


class PresenceSnapshot(IdMixin, TimestampMixin, Base):
    """The latest snapped position of one sharing Account; replaced, never appended."""

    __tablename__ = "presence_snapshots"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    latitude: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    longitude: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    accuracy_meters: Mapped[int] = mapped_column(Integer, nullable=False)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consent_generation: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("space_id", "account_id", name="uq_presence_snapshots_space_account"),
        CheckConstraint("latitude BETWEEN -90 AND 90", name="latitude_in_range"),
        CheckConstraint("longitude BETWEEN -180 AND 180", name="longitude_in_range"),
        CheckConstraint("accuracy_meters >= 1000", name="accuracy_is_coarse"),
        Index("ix_presence_snapshots_expires_at", "expires_at"),
    )


class PresenceDeviceCredential(IdMixin, TimestampMixin, Base):
    """A narrow credential that lets one device publish its owner's snapshot.

    It authorizes only the background snapshot upload. It is bound to the
    issuing device session (revocation, expiry and sign-out end it), to the
    consent generation it was issued for (any settings change ends it) and to
    an absolute expiry. Only the token hash is stored.
    """

    __tablename__ = "presence_device_credentials"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
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
    device_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    consent_generation: Mapped[int] = mapped_column(Integer, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_presence_device_credentials_token_hash"),
        UniqueConstraint(
            "space_id",
            "account_id",
            "device_id",
            name="uq_presence_device_credentials_owner_device",
        ),
        Index("ix_presence_device_credentials_expires_at", "expires_at"),
    )
