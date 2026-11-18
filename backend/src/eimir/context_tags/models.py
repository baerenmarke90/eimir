"""Discardable protected suggestions with real parent ownership and cascade deletion."""

from datetime import datetime
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from eimir.core.context_tags import ContextTags
from eimir.db.base import Base
from eimir.db.mixins import IdMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class TagSuggestionPayload(ProtectedPayload):
    tags: ContextTags = Field(default_factory=list)


class TagSuggestion(IdMixin, Base):
    __tablename__ = "context_tag_suggestions"

    space_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    memory_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    heart_moment_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True))
    source_version: Mapped[int] = mapped_column(Integer, nullable=False)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default="0"
    )
    payload: Mapped[TagSuggestionPayload] = mapped_column(
        ProtectedPayloadJSON(TagSuggestionPayload), nullable=False
    )

    __table_args__ = (
        Index("ix_context_tag_space_generated", "space_id", "generated_at"),
        CheckConstraint(
            "(memory_id IS NOT NULL)::integer + (heart_moment_id IS NOT NULL)::integer = 1",
            name="context_tag_one_parent",
        ),
        CheckConstraint(
            "source_version > 0 AND crypto_version >= 0", name="context_tag_versions_valid"
        ),
        ForeignKeyConstraint(
            ["memory_id", "space_id"], ["memories.id", "memories.space_id"], ondelete="CASCADE"
        ),
        ForeignKeyConstraint(
            ["heart_moment_id", "space_id"],
            ["heart_moments.id", "heart_moments.space_id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("memory_id", name="uq_context_tag_memory"),
        UniqueConstraint("heart_moment_id", name="uq_context_tag_heart_moment"),
    )
