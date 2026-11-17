"""Persistence for shared notes (#1969).

A shared note is Space content in the same sense as a shared list: both
partners read it and both may edit it. It is a different aggregate from the
owner-only ``PrivateNote`` on purpose. The two never convert into each other
and a shared surface never sees a private note.
"""

from __future__ import annotations

from datetime import datetime
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    UniqueConstraint,
    func,
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

# Technical bounds against abusive payloads, not product limits (decision 0016).
TITLE_MAX_LENGTH = 200
BODY_MAX_LENGTH = 20_000


class SharedNotePayload(ProtectedPayload):
    """Protected user content of a shared note.

    The title is optional free text. A note may have only a body, only a title,
    or both; a note with neither is rejected by the service.
    """

    title: str = ""
    body: str = ""


class SharedNote(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A shared, collaboratively editable free-text note."""

    __tablename__ = "shared_notes"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Shared note not found.", "SHARED_NOTE_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    # Pinned notes lead the overview and appear on Wir (at most five tiles there).
    pinned: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    # Presentation only: the Wir tile then shows the title without an excerpt,
    # for notes that carry door codes or passwords.
    wir_title_only: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    # When and by whom the content last changed. Pinning or hiding the excerpt
    # advances ``updated_at`` and ``version`` but is not an edit, so it neither
    # reorders the overview nor changes the "last edited by" line.
    edited_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    edited_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    payload: Mapped[SharedNotePayload] = mapped_column(
        ProtectedPayloadJSON(SharedNotePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        UniqueConstraint("id", "space_id", name="uq_shared_notes_id_space_id"),
        Index("ix_shared_notes_owner_id", "owner_id"),
        Index("ix_shared_notes_edited_by", "edited_by"),
        Index("ix_shared_notes_space_id_edited_at_id", "space_id", "edited_at", "id"),
    )


def shared_privacy() -> PrivacyClass:
    """A shared note is always shared Space content."""
    return PrivacyClass.SPACE_SHARED
