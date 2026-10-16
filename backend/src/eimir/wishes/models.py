"""Persistence for shared M3 wishes."""

from __future__ import annotations

from enum import StrEnum
from typing import ClassVar

from sqlalchemy import CheckConstraint, Index, SmallInteger, UniqueConstraint, text
from sqlalchemy import Enum as SqlEnum
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


class WishStatus(StrEnum):
    """State machine defined by M3-D02/D03/D04.

    The complete set is declared here. A wish begins at ``OPEN`` and reaches
    the other states only through the wish-to-plan lifecycle. Keeping the
    values in the model and database avoids a later status-type migration over
    existing rows.
    """

    OPEN = "OPEN"
    PLANNED = "PLANNED"
    COMPLETED = "COMPLETED"


def wish_status_type() -> SqlEnum:
    """Column type for ``status``.

    As with ``privacy_class``, this uses VARCHAR plus CHECK rather than a
    PostgreSQL enum. Adding a later value therefore requires an ordinary
    migration rather than a database type change with limited reversibility.
    """
    return SqlEnum(
        *(status.value for status in WishStatus),
        name="wish_status",
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
    )


class WishPayload(ProtectedPayload):
    """Protected content of a wish.

    M3 wishes contain only a title, but it still lives behind the
    ``ProtectedPayload`` boundary. Per M3-D13, wish titles belong neither in
    logs nor event payloads, and status, ordering, and authorization must not
    depend on their plaintext.
    """

    title: str


class Wish(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A shared wish that both partners may read and write.

    Unlike memory and milestone, wishes use collaborative write semantics under
    M3-D01. ``owner_id`` therefore represents ``createdBy`` attribution and
    audit metadata rather than an ACL boundary.
    """

    __tablename__ = "wishes"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Wish not found.", "WISH_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    status: Mapped[str] = mapped_column(
        wish_status_type(),
        nullable=False,
        default=WishStatus.OPEN.value,
        server_default=text("'OPEN'"),
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[WishPayload] = mapped_column(
        ProtectedPayloadJSON(WishPayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Supports the composite foreign key from ``plans``. ID alone would
        # allow a plan to reference a wish from another space. The service
        # prevents that, and the database enforces it as well (M3-D02).
        UniqueConstraint("id", "space_id", name="uq_wishes_id_space_id"),
        Index("ix_wishes_owner_id", "owner_id"),
        Index("ix_wishes_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_wishes_space_id_status", "space_id", "status"),
    )


def shared_privacy() -> PrivacyClass:
    """A wish is always shared space content (M3-D01)."""
    return PrivacyClass.SPACE_SHARED
