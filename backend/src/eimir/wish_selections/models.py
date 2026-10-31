"""One current decision round per Space; no history of rejected choices."""

from __future__ import annotations

from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKeyConstraint,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivateResourceMixin, ResourceAbsence, SharedWrite
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class WishSelectionRoundPayload(ProtectedPayload):
    title: str | None = None


class WishSelectionPayload(ProtectedPayload):
    favorite_wish_ids: list[UUID]


class WishSelectionRound(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    __tablename__ = "wish_selection_rounds"

    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE
    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Wish selection not found.", "WISH_SELECTION_NOT_FOUND"
    )

    membership_context: Mapped[str] = mapped_column(String(64), nullable=False)
    candidate_count: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    payload: Mapped[WishSelectionRoundPayload] = mapped_column(
        ProtectedPayloadJSON(WishSelectionRoundPayload), nullable=False
    )

    __table_args__ = (
        UniqueConstraint("space_id", name="uq_wish_selection_rounds_space"),
        UniqueConstraint("id", "space_id", name="uq_wish_selection_rounds_id_space"),
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_shared"),
        CheckConstraint("candidate_count BETWEEN 2 AND 5", name="candidate_count_is_bounded"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )


class WishSelectionCandidate(Base):
    __tablename__ = "wish_selection_candidates"

    round_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    wish_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    space_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    wish_version: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        ForeignKeyConstraint(
            ["round_id", "space_id"],
            ["wish_selection_rounds.id", "wish_selection_rounds.space_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        UniqueConstraint("round_id", "position", name="uq_wish_selection_candidates_position"),
        CheckConstraint("position BETWEEN 0 AND 4", name="position_is_bounded"),
        CheckConstraint("wish_version > 0", name="wish_version_is_positive"),
    )


class WishSelection(IdMixin, VersionMixin, PrivateResourceMixin, Base):
    __tablename__ = "wish_selections"

    round_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    published: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    crypto_version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    payload: Mapped[WishSelectionPayload] = mapped_column(
        ProtectedPayloadJSON(WishSelectionPayload), nullable=False
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["round_id", "space_id"],
            ["wish_selection_rounds.id", "wish_selection_rounds.space_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("round_id", "owner_id", name="uq_wish_selections_round_owner"),
        CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
