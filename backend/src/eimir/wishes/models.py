"""Persistence for shared M3 wishes."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    UniqueConstraint,
    Uuid,
    event,
    text,
)
from sqlalchemy import Enum as SqlEnum
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivacyClass,
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
)
from eimir.core.context_tags import ContextTags
from eimir.core.ids import new_id
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

    Wish titles, descriptions, and authored context tags live behind the
    ``ProtectedPayload`` boundary. Per M3-D13, authored content belongs neither in
    logs nor event payloads, and status, ordering, and authorization must not
    depend on their plaintext.
    """

    title: str
    description: str | None = Field(default=None, exclude_if=lambda value: value is None)
    tags: ContextTags = Field(default_factory=list)


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
    followed_from_wish_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    """The completed Wish this one repeats ("Nochmal erleben", #1816).

    A soft follow-up link, not a lifecycle edge: the source stays ``COMPLETED``
    and keeps its own Plan (``Plan.sourceWishId`` stays unique). It is cleared
    when the source is deleted; ``series_id`` and ``series_position`` keep the
    history readable without it.
    """
    series_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    """Groups a Wish with its repeats. The first Wish uses its own ``id``; a
    repeat inherits the source's value. Deliberately not a foreign key, so it
    survives deletion of the first Wish."""
    series_position: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    """1 for the first Wish of a series, source position + 1 for a repeat.
    Immutable after creation."""

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        CheckConstraint("series_position >= 1", name="series_position_is_positive"),
        # Composite so a repeat cannot point at a Wish in another space. The
        # column list on SET NULL keeps the NOT NULL ``space_id`` intact,
        # exactly as for ``plans.place_id``.
        ForeignKeyConstraint(
            ["followed_from_wish_id", "space_id"],
            ["wishes.id", "wishes.space_id"],
            name="fk_wishes_followed_from_wish_id_wishes",
            ondelete="SET NULL (followed_from_wish_id)",
        ),
        Index("ix_wishes_followed_from_wish_id", "followed_from_wish_id"),
        Index("ix_wishes_space_id_series_id", "space_id", "series_id"),
        # Supports the composite foreign key from ``plans``. ID alone would
        # allow a plan to reference a wish from another space. The service
        # prevents that, and the database enforces it as well (M3-D02).
        UniqueConstraint("id", "space_id", name="uq_wishes_id_space_id"),
        Index("ix_wishes_owner_id", "owner_id"),
        Index("ix_wishes_space_id_created_at_id", "space_id", "created_at", "id"),
        Index("ix_wishes_space_id_status", "space_id", "status"),
    )


class WishReminder(IdMixin, Base):
    """Personal schedule tied to the authoritative shared Wish."""

    __tablename__ = "wish_reminders"

    space_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    wish_id: Mapped[UUID] = mapped_column(Uuid, nullable=False)
    account_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False
    )
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        UniqueConstraint("wish_id", "account_id", name="uq_wish_reminders_wish_account"),
        Index("ix_wish_reminders_account_space", "account_id", "space_id"),
    )


def shared_privacy() -> PrivacyClass:
    """A wish is always shared space content (M3-D01)."""
    return PrivacyClass.SPACE_SHARED


@event.listens_for(Wish, "before_insert")
def _default_series_to_own_id(_mapper: object, _connection: object, wish: Wish) -> None:
    """A Wish that is not a repeat starts its own series.

    ``series_id`` equals the Wish's own ID for the first Wish, which a column
    default cannot express because the ID is itself a default. Repeats set the
    inherited value explicitly before insert.
    """
    if wish.series_id is None:
        if wish.id is None:
            wish.id = new_id()
        wish.series_id = wish.id
