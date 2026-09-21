"""Persistence for owner-only M3 PrivateNotes."""

from __future__ import annotations

from typing import ClassVar

from sqlalchemy import Boolean, CheckConstraint, Index, SmallInteger, text
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class PrivateNotePayload(ProtectedPayload):
    """Protected PrivateNote content."""

    title: str
    body: str


class PrivateNote(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A note visible and writable only by its owner."""

    __tablename__ = "private_notes"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Private Note not found.", "PRIVATE_NOTE_NOT_FOUND"
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
    payload: Mapped[PrivateNotePayload] = mapped_column(
        ProtectedPayloadJSON(PrivateNotePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index("ix_private_notes_owner_id", "owner_id"),
        Index(
            "ix_private_notes_space_owner_created_at_id",
            "space_id",
            "owner_id",
            "created_at",
            "id",
        ),
    )


def owner_only_privacy() -> PrivacyClass:
    """PrivateNotes are always hard owner-only content."""
    return PrivacyClass.OWNER_ONLY
