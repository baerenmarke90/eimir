"""Herzversteck: one hidden heart in one photo for one partner to find (#1907 H3)."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin


class HeartRoundState(StrEnum):
    HIDDEN = "HIDDEN"
    FOUND = "FOUND"


class HeartHuntRound(IdMixin, Base):
    """A round holds the photo reference, the normalized heart and the search state.

    The heart position is a pair of per-mille integers (0..1000) of the photo
    frame. The server never serializes it for the seeker before the round is
    FOUND; the seeker's taps are evaluated here. No coordinate of the real world
    is ever stored: the game reads no location, and the photo is a normal
    attachment whose metadata is stripped at upload.
    """

    __tablename__ = "heart_hunt_rounds"

    space_id: Mapped[UUID] = mapped_column(
        ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    hider_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    seeker_id: Mapped[UUID] = mapped_column(
        ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    request_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    attachment_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("attachments.id", ondelete="SET NULL")
    )
    heart_x: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    heart_y: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    state: Mapped[str] = mapped_column(
        String(8), nullable=False, default=HeartRoundState.HIDDEN.value
    )
    # Bounded list of [x, y] per-mille taps so a reopened round restores its clearings.
    taps: Mapped[list[Any]] = mapped_column(
        postgresql.JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    tap_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    best_level: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default=text("0")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    found_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purge_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    kept_memory_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("memories.id", ondelete="SET NULL")
    )

    __table_args__ = (
        CheckConstraint("heart_x BETWEEN 0 AND 1000", name="heart_x_in_frame"),
        CheckConstraint("heart_y BETWEEN 0 AND 1000", name="heart_y_in_frame"),
        CheckConstraint("state IN ('HIDDEN', 'FOUND')", name="state_allowed"),
        CheckConstraint("best_level BETWEEN 0 AND 3", name="best_level_allowed"),
        CheckConstraint("hider_id <> seeker_id", name="hider_is_not_seeker"),
        CheckConstraint("state = 'FOUND' OR found_at IS NULL", name="found_at_only_when_found"),
        UniqueConstraint("attachment_id", name="uq_heart_hunt_rounds_attachment"),
        UniqueConstraint("space_id", "hider_id", "request_id", name="uq_heart_hunt_rounds_request"),
        # At most one open round per hider keeps a round a gift, not a queue.
        Index(
            "uq_heart_hunt_rounds_open_per_hider",
            "space_id",
            "hider_id",
            unique=True,
            postgresql_where=text("state = 'HIDDEN'"),
        ),
        Index("ix_heart_hunt_rounds_purge_after", "purge_after"),
        Index("ix_heart_hunt_rounds_space_created", "space_id", "created_at"),
    )
