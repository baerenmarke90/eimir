"""Persistence for M2 HeartMoments."""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    SmallInteger,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    ENFORCEABLE_PRIVACY_CLASSES,
    PrivateResourceMixin,
    ResourceAbsence,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class HeartEmotion(StrEnum):
    """Emotions defined by the M2 domain contract.

    This is a closed value set but not metadata: the value lives in the
    ProtectedPayload rather than a dedicated column. See M2-D06.
    """

    LOVED = "LOVED"
    SEEN = "SEEN"
    APPRECIATED = "APPRECIATED"
    SUPPORTED = "SUPPORTED"
    GRATEFUL = "GRATEFUL"
    HAPPY = "HAPPY"


class HeartMomentPayload(ProtectedPayload):
    """Protected content of a HeartMoment.

    `emotion` deliberately lives here rather than in a column. The value
    describes sensitive relationship content and permits private inferences
    even without the text; sorting, tenant isolation, and routing do not need
    it (M2-D06). Filtering by emotion is therefore not part of the M2
    contract: it would require either a plaintext column or an index, exactly
    what this boundary avoids.
    """

    text: str
    emotion: HeartEmotion


class HeartMoment(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A HeartMoment that is either shared or owner-only by visibility.

    Unlike Memory, this table carries both enforceable privacy classes. The
    owner chooses through `visibility`; the privacy class is derived
    server-side and is never a client-controlled field.
    """

    __tablename__ = "heart_moments"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Heart moment not found.", "RESOURCE_NOT_FOUND"
    )

    # At most one attachment (M2-D03). Model this as a foreign key rather than
    # a relation table so cardinality lives in the schema instead of a rule
    # that application code could forget.
    happened_on: Mapped[date] = mapped_column(Date, nullable=False)
    attachment_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="RESTRICT"),
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[HeartMomentPayload] = mapped_column(
        ProtectedPayloadJSON(HeartMomentPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "privacy_class IN ("
            + ", ".join(f"'{privacy.value}'" for privacy in ENFORCEABLE_PRIVACY_CLASSES)
            + ")",
            name="privacy_is_enforceable",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Prevent the same attachment from belonging to two HeartMoments.
        UniqueConstraint("attachment_id", name="uq_heart_moments_attachment"),
        # Target of the foreign key from `place_heart_moments`. The privacy
        # class deliberately participates in it so the join row can carry the
        # shared state of its target, and so a transition to OWNER_ONLY breaks
        # a forgotten relation instead of leaving it behind (M3-D09).
        UniqueConstraint(
            "id",
            "space_id",
            "privacy_class",
            name="uq_heart_moments_id_space_id_privacy",
        ),
        Index("ix_heart_moments_owner_id", "owner_id"),
        Index("ix_heart_moments_space_id_created_at_id", "space_id", "created_at", "id"),
        Index(
            "ix_heart_moments_space_id_privacy_class",
            "space_id",
            "privacy_class",
        ),
        Index("ix_heart_moments_space_id_happened_on", "space_id", "happened_on"),
    )
