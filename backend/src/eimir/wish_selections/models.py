"""One current decision round per Space; no history of rejected choices.

A candidate is typed: an ordinary Space Wish (Free/Core) or a curated date idea
from the bundled Pro catalog (``planning.date_inspiration``). A date idea is
referenced by its persistent editorial ID and a content revision, never copied
into a Wish before the couple deliberately adopts a common favorite.
"""

from __future__ import annotations

from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from pydantic import Field
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


class WishSelectionCandidateSource(StrEnum):
    WISH = "WISH"
    DATE_IDEA = "DATE_IDEA"


class WishSelectionDecisionMethod(StrEnum):
    RANDOM = "RANDOM"
    MANUAL = "MANUAL"


class WishSelectionRoundPayload(ProtectedPayload):
    title: str | None = None


class WishSelectionPayload(ProtectedPayload):
    favorite_wish_ids: list[UUID]
    # Absent in selections stored before typed candidates existed.
    favorite_date_idea_ids: list[str] = Field(default_factory=list)


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
    # Consent-based random pick (#1907 J1): at most one open or declined
    # request per round, identified by the partner who asked.
    random_requested_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), nullable=True
    )
    random_declined: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # The decided candidate, stored once so both devices show the same pick.
    decision_position: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    decision_method: Mapped[str | None] = mapped_column(String(8), nullable=True)

    __table_args__ = (
        UniqueConstraint("space_id", name="uq_wish_selection_rounds_space"),
        UniqueConstraint("id", "space_id", name="uq_wish_selection_rounds_id_space"),
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_shared"),
        CheckConstraint("candidate_count BETWEEN 2 AND 5", name="candidate_count_is_bounded"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        CheckConstraint(
            "random_requested_by IS NOT NULL OR NOT random_declined",
            name="random_decline_has_request",
        ),
        CheckConstraint(
            "(decision_position IS NULL AND decision_method IS NULL)"
            " OR (decision_position BETWEEN 0 AND 4 AND decision_method IN ('RANDOM', 'MANUAL'))",
            name="decision_is_complete",
        ),
    )


class WishSelectionCandidate(Base):
    __tablename__ = "wish_selection_candidates"

    round_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    position: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    space_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=WishSelectionCandidateSource.WISH.value,
        server_default=text("'WISH'"),
    )
    wish_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True), nullable=True)
    wish_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Persistent editorial ID (``eimir-date-001``); never a Wish or Plan ID.
    date_idea_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Content fingerprint of the referenced catalog entry when the round was set.
    date_idea_revision: Mapped[str | None] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["round_id", "space_id"],
            ["wish_selection_rounds.id", "wish_selection_rounds.space_id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        UniqueConstraint("round_id", "wish_id", name="uq_wish_selection_candidates_wish"),
        UniqueConstraint("round_id", "date_idea_id", name="uq_wish_selection_candidates_date_idea"),
        CheckConstraint("position BETWEEN 0 AND 4", name="position_is_bounded"),
        CheckConstraint(
            "(source_type = 'WISH' AND wish_id IS NOT NULL AND wish_version > 0"
            " AND date_idea_id IS NULL AND date_idea_revision IS NULL)"
            " OR (source_type = 'DATE_IDEA' AND wish_id IS NULL AND wish_version IS NULL"
            " AND date_idea_id IS NOT NULL AND date_idea_revision IS NOT NULL)",
            name="source_is_typed",
        ),
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
