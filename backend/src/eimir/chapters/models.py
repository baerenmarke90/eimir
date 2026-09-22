"""Persistence for shared M3 chapters."""

from __future__ import annotations

from datetime import date
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class ChapterPayload(ProtectedPayload):
    """Protected user content of a chapter."""

    title: str
    description: str | None = None


class Chapter(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A shared, collaboratively editable grouping of couple history."""

    __tablename__ = "chapters"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Chapter not found.", "CHAPTER_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    start_on: Mapped[date | None] = mapped_column(Date)
    end_on: Mapped[date | None] = mapped_column(Date)
    place_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[ChapterPayload] = mapped_column(
        ProtectedPayloadJSON(ChapterPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        CheckConstraint(
            "start_on IS NULL OR end_on IS NULL OR end_on >= start_on",
            name="date_range_is_valid",
        ),
        UniqueConstraint("id", "space_id", name="uq_chapters_id_space_id"),
        ForeignKeyConstraint(
            ["place_id", "space_id"],
            ["places.id", "places.space_id"],
            name="fk_chapters_place_id_places",
            ondelete="SET NULL (place_id)",
        ),
        Index("ix_chapters_owner_id", "owner_id"),
        Index("ix_chapters_place_id", "place_id"),
        Index("ix_chapters_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_chapters_space_id_start_on", "space_id", "start_on"),
    )


def shared_privacy() -> PrivacyClass:
    """A chapter is always shared space content (M3-D01)."""
    return PrivacyClass.SPACE_SHARED
