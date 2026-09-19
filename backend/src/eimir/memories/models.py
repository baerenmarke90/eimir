"""Persistence for shared M2 memories."""

from __future__ import annotations

from datetime import date, datetime
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class MemoryPayload(ProtectedPayload):
    """Protected content of a memory.

    Title and body deliberately share the same ``ProtectedPayload`` boundary.
    Sorting, tenant isolation, and authorization must not depend on their
    plaintext.
    """

    title: str
    body: str


class Memory(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A memory readable by both active partners and editable by its author."""

    __tablename__ = "memories"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Memory not found.", "RESOURCE_NOT_FOUND"
    )

    happened_on: Mapped[date | None] = mapped_column(Date)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[MemoryPayload] = mapped_column(
        ProtectedPayloadJSON(MemoryPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Supports the composite foreign key used by place-memory relations.
        # Without this pair, a relation row could not constrain both resource
        # ID and space, leaving same-space enforcement only to service code.
        UniqueConstraint("id", "space_id", name="uq_memories_id_space_id"),
        Index("ix_memories_owner_id", "owner_id"),
        Index("ix_memories_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_memories_space_id_happened_on", "space_id", "happened_on"),
        Index(
            "ix_memories_search_fts",
            text(
                "(setweight(to_tsvector('simple', coalesce(payload->>'title', '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(payload->>'body', '')), 'B'))"
            ),
            postgresql_using="gin",
        ),
    )


class MemoryCreateReceipt(IdMixin, Base):
    """Technical receipt tying one request identity to the Memory it created.

    The receipt is written in the same transaction as the Memory, so it exists
    exactly when the create committed. It deliberately stores no request
    content: only a fingerprint used to detect identity reuse with a different
    payload. Rows are bounded in lifetime (see ``create_receipts``) and the
    reference to the Memory is nulled, not cascaded, so a later delete cannot
    make a stale retry recreate the Memory.
    """

    __tablename__ = "memory_create_receipts"

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
    idempotency_key: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    request_fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    # NULL while the creating transaction is still open, and afterwards when
    # the Memory has been deleted.
    memory_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("memories.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "space_id",
            "account_id",
            "idempotency_key",
            name="uq_memory_create_receipts_identity",
        ),
        CheckConstraint(
            "char_length(request_fingerprint) = 64",
            name="request_fingerprint_is_sha256_hex",
        ),
        Index("ix_memory_create_receipts_created_at", "created_at"),
        Index("ix_memory_create_receipts_memory_id", "memory_id"),
    )


def shared_privacy() -> PrivacyClass:
    """Memories are always shared space content in M2."""
    return PrivacyClass.SPACE_SHARED
