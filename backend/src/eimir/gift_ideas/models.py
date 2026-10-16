"""Persistence for owner-only M3 GiftIdeas."""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import ClassVar

from sqlalchemy import Boolean, CheckConstraint, Index, SmallInteger, text
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class GiftIdeaStatus(StrEnum):
    """GiftIdea lifecycle frozen by M3-D17."""

    IDEA = "IDEA"
    BOUGHT = "BOUGHT"
    GIVEN = "GIVEN"


def gift_idea_status_type() -> SqlEnum:
    return SqlEnum(
        *(status.value for status in GiftIdeaStatus),
        name="gift_idea_status",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


class GiftIdeaPayload(ProtectedPayload):
    """Protected GiftIdea content; URLs remain inert user content."""

    title: str
    description: str | None = None
    recipient: str | None = None
    occasion: str | None = None
    target_on: date | None = None
    price_text: str | None = None
    url: str | None = None


class GiftIdea(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A private gift idea visible and writable only by its owner."""

    __tablename__ = "gift_ideas"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Gift Idea not found.", "GIFT_IDEA_NOT_FOUND"
    )

    status: Mapped[str] = mapped_column(
        gift_idea_status_type(),
        nullable=False,
        default=GiftIdeaStatus.IDEA.value,
        server_default=text("'IDEA'"),
    )
    pinned: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[GiftIdeaPayload] = mapped_column(
        ProtectedPayloadJSON(GiftIdeaPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index("ix_gift_ideas_owner_id", "owner_id"),
        Index(
            "ix_gift_ideas_space_owner_created_at_id",
            "space_id",
            "owner_id",
            "created_at",
            "id",
        ),
        Index("ix_gift_ideas_space_owner_status", "space_id", "owner_id", "status"),
    )


def owner_only_privacy() -> PrivacyClass:
    """GiftIdeas are always hard owner-only content."""
    return PrivacyClass.OWNER_ONLY
