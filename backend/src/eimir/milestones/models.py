"""Persistence for shared M2 milestones."""

from __future__ import annotations

from datetime import date
from typing import ClassVar

from sqlalchemy import CheckConstraint, Date, Index, SmallInteger, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class MilestonePayload(ProtectedPayload):
    """Protected content of a milestone.

    As with memories, title and body share the ``ProtectedPayload`` boundary.
    Sorting and authorization must not depend on their plaintext.
    """

    title: str
    body: str | None = None


class Milestone(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A shared milestone readable by both partners and editable by its author.

    Unlike a memory, ``happened_on`` is required. A milestone without a date
    would not be a milestone, and story ordering depends on that date.
    """

    __tablename__ = "milestones"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Milestone not found.", "RESOURCE_NOT_FOUND"
    )

    happened_on: Mapped[date] = mapped_column(Date, nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[MilestonePayload] = mapped_column(
        ProtectedPayloadJSON(MilestonePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Supports the composite foreign key used by place-milestone relations.
        # Without this pair, a relation row could not constrain both resource
        # ID and space, leaving same-space enforcement only to service code.
        UniqueConstraint("id", "space_id", name="uq_milestones_id_space_id"),
        Index("ix_milestones_owner_id", "owner_id"),
        Index("ix_milestones_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_milestones_space_id_happened_on", "space_id", "happened_on"),
    )


def shared_privacy() -> PrivacyClass:
    """Milestones are always shared space content under M2-D25."""
    return PrivacyClass.SPACE_SHARED
