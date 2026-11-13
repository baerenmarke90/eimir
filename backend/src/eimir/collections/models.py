"""Persistence for shared M3 collections."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    Boolean,
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


class CollectionPayload(ProtectedPayload):
    """Protected user content of a shared Collection root."""

    title: str


class CollectionItemPayload(ProtectedPayload):
    """Protected user content of a Collection Item.

    ``quantity`` is optional free text with units (for example ``2 l``). It is
    display text only: it is never parsed, converted or summed. Items stored
    before it existed simply have none.
    """

    title: str
    quantity: str | None = None


class CollectionKind(StrEnum):
    """Presentation variant of a Collection, fixed when it is created (#1808)."""

    GENERIC = "GENERIC"
    SHOPPING = "SHOPPING"


class Collection(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A shared, collaboratively editable list aggregate."""

    __tablename__ = "collections"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Collection not found.", "COLLECTION_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    # Structural variant, not user content: it never changes after creation.
    kind: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default=CollectionKind.GENERIC.value,
        server_default=text("'GENERIC'"),
    )
    payload: Mapped[CollectionPayload] = mapped_column(
        ProtectedPayloadJSON(CollectionPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        CheckConstraint("kind IN ('GENERIC', 'SHOPPING')", name="kind_is_known"),
        UniqueConstraint("id", "space_id", name="uq_collections_id_space_id"),
        Index("ix_collections_owner_id", "owner_id"),
        Index("ix_collections_space_id_created_at_id", "space_id", "created_at", "id"),
    )


class CollectionItem(IdMixin, TimestampMixin, VersionMixin, Base):
    """A child item whose content version is independent from aggregate order."""

    __tablename__ = "collection_items"

    collection_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    # Who completed the item and when. Both are NULL while the item is open,
    # and stay NULL for items completed before they were recorded. The account
    # reference is dropped (not the item) when that account is deleted.
    completed_by: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[CollectionItemPayload] = mapped_column(
        ProtectedPayloadJSON(CollectionItemPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("position >= 0", name="position_is_non_negative"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        UniqueConstraint(
            "collection_id",
            "position",
            name="uq_collection_items_collection_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint(
            "completed OR (completed_by IS NULL AND completed_at IS NULL)",
            name="completion_details_only_when_completed",
        ),
        Index("ix_collection_items_created_by", "created_by"),
        Index("ix_collection_items_completed_by", "completed_by"),
        Index("ix_collection_items_collection_id_id", "collection_id", "id"),
    )


def shared_privacy() -> PrivacyClass:
    """A Collection is always shared Space content (M3-D13)."""
    return PrivacyClass.SPACE_SHARED
