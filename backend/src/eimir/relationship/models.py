"""Space and Membership, the tenant model.

    Account A ──┐
                ├── Membership ── Space
    Account B ──┘

The Space is a couple's private shared room. Every shared record belongs to
exactly one Space.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin

MAX_ACTIVE_PARTNERS = 2
"""A normal couple Space has at most two active partners."""


class MembershipStatus(StrEnum):
    ACTIVE = "ACTIVE"
    LEFT = "LEFT"
    REMOVED = "REMOVED"


class MembershipRole(StrEnum):
    PARTNER = "PARTNER"


class DurationDisplayMode(StrEnum):
    """How shared relationship time is displayed."""

    YEARS_MONTHS = "YEARS_MONTHS"
    DAYS = "DAYS"


class DailyCheckInVisibilityMode(StrEnum):
    """How one DailyCheckIn dimension becomes visible to the partner."""

    IMMEDIATE = "IMMEDIATE"
    MUTUAL_REVEAL = "MUTUAL_REVEAL"


class Space(IdMixin, TimestampMixin, Base):
    __tablename__ = "spaces"

    # M7-S0 configuration authority is explicit Space state. New Spaces persist
    # the founder here; legacy Spaces that cannot be backfilled without guessing
    # remain unassigned and therefore fail closed for configuration writes.
    configuration_manager_account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )

    # This is a frozen product/privacy promise, not a derived deployment setting.
    # It is written once when the last active Membership ends so future policy
    # versions cannot silently extend or shorten an already-promised deadline.
    offboarding_purge_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    memberships: Mapped[list[Membership]] = relationship(
        back_populates="space", cascade="all, delete-orphan"
    )
    profile: Mapped[SpaceProfile | None] = relationship(
        back_populates="space", cascade="all, delete-orphan", uselist=False
    )
    configuration: Mapped[SpaceConfiguration | None] = relationship(
        back_populates="space", cascade="all, delete-orphan", uselist=False
    )


class Membership(IdMixin, TimestampMixin, Base):
    """An account's membership in a Space.

    This is the only path through which an account can reach Space data. An
    ended membership is not deleted but marked LEFT or REMOVED; otherwise it
    would no longer be possible to determine who created content later.
    """

    __tablename__ = "memberships"

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

    role: Mapped[str] = mapped_column(
        String(16), nullable=False, default=MembershipRole.PARTNER.value
    )
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default=MembershipStatus.ACTIVE.value
    )

    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    space: Mapped[Space] = relationship(back_populates="memberships")

    __table_args__ = (
        # An account is a member of a Space at most once. Two rows would create
        # two sources of truth about whether somebody has access.
        UniqueConstraint("space_id", "account_id", name="uq_memberships_space_id_account_id"),
        CheckConstraint("status IN ('ACTIVE', 'LEFT', 'REMOVED')", name="status_is_known"),
        CheckConstraint("role IN ('PARTNER')", name="role_is_known"),
        # The guard queries exactly this combination for every request.
        Index("ix_memberships_account_id_space_id_status", "account_id", "space_id", "status"),
    )

    @property
    def is_active(self) -> bool:
        return self.status == MembershipStatus.ACTIVE.value


class SpacePresence(Base):
    """Ephemeral current-presence identity for one Account in one Space.

    This table deliberately stores exactly one current timestamp per Account+Space.
    It is not an activity log and has no created/updated history columns.
    """

    __tablename__ = "space_presence"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class SpaceProfile(IdMixin, TimestampMixin, VersionMixin, Base):
    """Relationship-related attributes of a Space."""

    __tablename__ = "space_profiles"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    # A domain calendar day, not an instant: a relationship start has no time
    # of day.
    relationship_started_on: Mapped[date | None] = mapped_column(Date)
    show_relationship_duration: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    duration_display_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default=DurationDisplayMode.YEARS_MONTHS.value
    )

    space: Mapped[Space] = relationship(back_populates="profile")

    __table_args__ = (
        UniqueConstraint("space_id", name="uq_space_profiles_space_id"),
        CheckConstraint(
            "duration_display_mode IN ('YEARS_MONTHS', 'DAYS')",
            name="duration_display_mode_is_known",
        ),
    )


class SpaceConfiguration(IdMixin, TimestampMixin, VersionMixin, Base):
    """Typed, shared product configuration for one relationship Space."""

    __tablename__ = "space_configurations"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )

    vibe_check_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    energy_check_in_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    love_notes_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    support_gestures_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    shared_achievements_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    daily_questions_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    daily_context_timezone: Mapped[str | None] = mapped_column(String(64))
    vibe_visibility_mode: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default=DailyCheckInVisibilityMode.IMMEDIATE.value,
    )
    energy_visibility_mode: Mapped[str] = mapped_column(
        String(24),
        nullable=False,
        default=DailyCheckInVisibilityMode.IMMEDIATE.value,
    )

    space: Mapped[Space] = relationship(back_populates="configuration")

    __table_args__ = (
        UniqueConstraint("space_id", name="uq_space_configurations_space_id"),
        CheckConstraint(
            "vibe_visibility_mode IN ('IMMEDIATE', 'MUTUAL_REVEAL')",
            name="vibe_visibility_mode_is_known",
        ),
        CheckConstraint(
            "energy_visibility_mode IN ('IMMEDIATE', 'MUTUAL_REVEAL')",
            name="energy_visibility_mode_is_known",
        ),
    )


class Invitation(IdMixin, TimestampMixin, Base):
    """An invitation into a Space.

    Only the token hash is stored. Reading the database therefore does not
    allow somebody to join another Space.

    Acceptance happens exactly once: `accepted_at` is the latch. Together
    with a row lock during acceptance it prevents two concurrent attempts from
    both succeeding.
    """

    __tablename__ = "invitations"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )

    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL")
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("token_hash", name="uq_invitations_token_hash"),
        Index("ix_invitations_space_id", "space_id"),
    )

    def is_open(self, at: datetime) -> bool:
        """Open means not accepted, not revoked, and not expired."""
        return self.accepted_at is None and self.revoked_at is None and self.expires_at > at
