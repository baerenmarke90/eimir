"""Calendar sync persistence (#1895).

Ownership is deliberately split:

- ``CalendarConnection`` belongs to one Account (the sponsor). Its encrypted
  payload holds the provider credentials; it is never returned to anyone, and
  the partner never sees it at all.
- ``SpaceCalendarTarget`` belongs to the Space: one shared target calendar per
  Space, sponsored by exactly one connection. Both partners see its status and
  may pause or end it.
- ``PlanCalendarLink`` maps one Plan to one managed external event of a target.
  It is keyed by the Plan id without a foreign key on purpose: after a Plan is
  deleted the link must survive until the managed event was handled.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class CalendarProviderKind(StrEnum):
    CALDAV = "CALDAV"
    GOOGLE = "GOOGLE"


class ConnectionStatus(StrEnum):
    PENDING = "PENDING"
    """Returned from an OAuth consent; the signed-in person must still confirm it."""
    ACTIVE = "ACTIVE"
    BROKEN = "BROKEN"
    """Credentials were rejected or the grant was revoked; the sponsor must reconnect."""


class TargetStatus(StrEnum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    """Paused by either partner."""
    SUSPENDED = "SUSPENDED"
    """Paused automatically: no Pro, a broken connection or a lost calendar."""


class LinkState(StrEnum):
    PENDING = "PENDING"
    """A write is in progress or waits for a retry; its outcome is not confirmed."""
    SYNCED = "SYNCED"
    CONFLICT = "CONFLICT"
    """The managed event changed or disappeared externally; a person decides."""
    KEPT = "KEPT"
    """The Plan is gone, but the changed external event was deliberately kept."""
    DETACHED = "DETACHED"
    """The couple stopped syncing this Plan; eimir. never touches the event again."""
    FAILED = "FAILED"


class CalendarConnectionPayload(ProtectedPayload):
    account_id: UUID
    label: str = Field(repr=False)
    """Host name or account address shown only to the sponsor."""
    caldav_url: str | None = Field(default=None, repr=False)
    caldav_username: str | None = Field(default=None, repr=False)
    caldav_password: str | None = Field(default=None, repr=False)
    caldav_home_path: str | None = Field(default=None, repr=False)
    caldav_calendar_path: str | None = Field(default=None, repr=False)
    google_refresh_token: str | None = Field(default=None, repr=False)
    google_client_binding: str | None = Field(default=None, repr=False)


class CalendarConnection(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "calendar_connections"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ConnectionStatus.ACTIVE.value
    )
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[CalendarConnectionPayload] = mapped_column(
        ProtectedPayloadJSON(CalendarConnectionPayload), nullable=False
    )

    __table_args__ = (
        CheckConstraint("provider IN ('CALDAV', 'GOOGLE')", name="provider_is_known"),
        CheckConstraint("status IN ('PENDING', 'ACTIVE', 'BROKEN')", name="status_is_known"),
        Index("ix_calendar_connections_account_id", "account_id"),
    )


class SpaceCalendarTargetPayload(ProtectedPayload):
    space_id: UUID
    calendar_ref: str = Field(repr=False)
    calendar_name: str = Field(repr=False)
    calendar_primary: bool = False


class SpaceCalendarTarget(IdMixin, TimestampMixin, VersionMixin, Base):
    __tablename__ = "space_calendar_targets"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    connection_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("calendar_connections.id", ondelete="CASCADE"),
        nullable=False,
    )
    sponsor_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=TargetStatus.ACTIVE)
    status_reason: Mapped[str | None] = mapped_column(String(48))
    """Fixed code for PAUSED/SUSPENDED (e.g. ``PRO_REQUIRED``), never provider text."""
    last_success_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[SpaceCalendarTargetPayload] = mapped_column(
        ProtectedPayloadJSON(SpaceCalendarTargetPayload), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('ACTIVE', 'PAUSED', 'SUSPENDED')", name="target_status_is_known"
        ),
        Index("ix_space_calendar_targets_connection_id", "connection_id"),
    )


class PlanCalendarLinkPayload(ProtectedPayload):
    space_id: UUID
    event_ref: str = Field(repr=False)
    uid: str = Field(repr=False)
    provider_version: str | None = Field(default=None, repr=False)


class PlanCalendarLink(IdMixin, TimestampMixin, Base):
    __tablename__ = "plan_calendar_links"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    target_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("space_calendar_targets.id", ondelete="CASCADE"),
        nullable=False,
    )
    plan_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    state: Mapped[str] = mapped_column(String(16), nullable=False, default=LinkState.PENDING)
    reason: Mapped[str | None] = mapped_column(String(48))
    synced_plan_version: Mapped[int | None] = mapped_column(Integer)
    backlink_plan_version: Mapped[int | None] = mapped_column(Integer)
    """Plan version last written with a backlink, absent for old or discreet events."""
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[PlanCalendarLinkPayload] = mapped_column(
        ProtectedPayloadJSON(PlanCalendarLinkPayload), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("target_id", "plan_id", name="uq_plan_calendar_links_target_plan"),
        CheckConstraint(
            "state IN ('PENDING', 'SYNCED', 'CONFLICT', 'KEPT', 'DETACHED', 'FAILED')",
            name="link_state_is_known",
        ),
        Index("ix_plan_calendar_links_space_plan", "space_id", "plan_id"),
    )


class CalendarOAuthPayload(ProtectedPayload):
    account_id: UUID
    space_id: UUID
    code_verifier: str = Field(repr=False)
    client_binding: str = Field(repr=False)
    return_to: str = "page"
    """``web``: same tab back to the settings; ``app``: back into the Android app; ``page``: a
    return page (older app builds)."""


class CalendarOAuthTransaction(IdMixin, Base):
    """One short-lived Google consent attempt; consumed exactly once by the callback."""

    __tablename__ = "calendar_oauth_transactions"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    state_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=2)
    payload: Mapped[CalendarOAuthPayload] = mapped_column(
        ProtectedPayloadJSON(CalendarOAuthPayload), nullable=False
    )

    __table_args__ = (Index("ix_calendar_oauth_transactions_account_id", "account_id"),)
