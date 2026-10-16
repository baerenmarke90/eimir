"""Persistence for M2 comments."""

from __future__ import annotations

from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from sqlalchemy import CheckConstraint, Index, SmallInteger, String, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class CommentTarget(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"


class CommentPayload(ProtectedPayload):
    body: str


class Comment(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    __tablename__ = "comments"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Comment not found.", "COMMENT_TARGET_NOT_AVAILABLE"
    )

    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[CommentPayload] = mapped_column(
        ProtectedPayloadJSON(CommentPayload), nullable=False
    )

    __table_args__ = (
        CheckConstraint(
            "privacy_class = 'SPACE_SHARED'",
            name="privacy_is_space_shared",
        ),
        CheckConstraint(
            "target_type IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE')",
            name="comment_target_type_allowed",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index(
            "ix_comments_space_target_created_at_id",
            "space_id",
            "target_type",
            "target_id",
            "created_at",
            "id",
        ),
        Index("ix_comments_owner_id", "owner_id"),
    )
