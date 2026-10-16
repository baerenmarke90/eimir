"""Persistence for owner-only M3 PrivateCollections."""

from __future__ import annotations

from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class PrivateCollectionPayload(ProtectedPayload):
    """Protected content of a PrivateCollection root."""

    title: str


class PrivateCollectionItemPayload(ProtectedPayload):
    """Protected content of a PrivateCollection Item."""

    title: str


class PrivateCollection(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """An owner-only private list aggregate."""

    __tablename__ = "private_collections"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Private Collection not found.", "PRIVATE_COLLECTION_NOT_FOUND"
    )

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[PrivateCollectionPayload] = mapped_column(
        ProtectedPayloadJSON(PrivateCollectionPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'OWNER_ONLY'", name="privacy_is_owner_only"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index("ix_private_collections_owner_id", "owner_id"),
        Index(
            "ix_private_collections_space_owner_created_at_id",
            "space_id",
            "owner_id",
            "created_at",
            "id",
        ),
    )


class PrivateCollectionItem(IdMixin, TimestampMixin, VersionMixin, Base):
    """A child item authorized exclusively through its PrivateCollection parent."""

    __tablename__ = "private_collection_items"

    collection_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("private_collections.id", ondelete="CASCADE"),
        nullable=False,
    )
    completed: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[PrivateCollectionItemPayload] = mapped_column(
        ProtectedPayloadJSON(PrivateCollectionItemPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("position >= 0", name="position_is_non_negative"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        UniqueConstraint(
            "collection_id",
            "position",
            name="uq_private_collection_items_collection_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index(
            "ix_private_collection_items_collection_id_id",
            "collection_id",
            "id",
        ),
    )


def owner_only_privacy() -> PrivacyClass:
    """PrivateCollections are always hard owner-only content."""
    return PrivacyClass.OWNER_ONLY
