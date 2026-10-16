"""Persistence for related people and important dates.

A child, parent, or friend: for eimir. these are not accounts. They do
not sign in, have no session, and receive no invitation. They are records
maintained by a partner in their space and therefore contain data about
third parties who cannot manage those records themselves. For that reason,
less is stored here than would technically be possible: display name,
relationship type, and a birthday. No address, school, or phone number.

The display name and the label of an important date are the protected parts
and are stored as `ProtectedPayload`, separate from metadata. Everything
needed for sorting, linking, and later reminders - relationship, date,
recurrence, and visibility - remains queryable as columns.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import (
    PrivateResourceMixin,
    ResourceAbsence,
)
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import CRYPTO_VERSION_PLAINTEXT, ProtectedPayload


class PersonRelationship(StrEnum):
    CHILD = "CHILD"
    PARENT = "PARENT"
    SIBLING = "SIBLING"
    FRIEND = "FRIEND"
    OTHER = "OTHER"


class ImportantDateType(StrEnum):
    BIRTHDAY = "BIRTHDAY"
    ANNIVERSARY = "ANNIVERSARY"
    CUSTOM = "CUSTOM"


class DateRepeat(StrEnum):
    """How often an important date recurs.

    Deliberately limited to two values. A full recurrence rule belongs to
    later reminder logic; birthdays and anniversaries do not need it.
    """

    NONE = "NONE"
    ANNUALLY = "ANNUALLY"


UNKNOWN_BIRTH_YEAR = 1904
"""Placeholder year for a birthday whose year is unknown.

`DATE` cannot represent a date without a year. Instead of splitting month
and day into separate columns - which would duplicate every date operation -
a fixed year is used and `birthday_year_known` indicates that the year has
no meaning. 1904 is a leap year, so February 29 remains representable.

The database enforces the placeholder so that a second code path cannot
choose another year and make the two populations incomparable.
"""


class RelatedPersonPayload(ProtectedPayload):
    """Protected plaintext for a related person."""

    display_name: str = Field(min_length=1, max_length=120)


class ImportantDatePayload(ProtectedPayload):
    """Protected label of an important date."""

    label: str = Field(min_length=1, max_length=120)


class RelatedPerson(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A person related to the couple who does not have an account."""

    __tablename__ = "related_persons"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Related person not found.", "RELATED_PERSON_NOT_FOUND"
    )

    relationship: Mapped[str] = mapped_column(String(16), nullable=False)
    birthday: Mapped[date | None] = mapped_column(Date)
    birthday_year_known: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    show_birthday_on_dashboard: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    """Explicit opt-in for this birthday to appear in Dashboard `upcoming`.

    Default off: a `RelatedPerson` is not automatically a Dashboard source
    just because it has a birthday (#617/#699). Independent of `visibility`
    and of any Reminder preference - enabling or disabling either one must
    not implicitly change the other.
    """
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    avatar_attachment_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("attachments.id", ondelete="SET NULL"),
        nullable=True,
    )
    payload: Mapped[RelatedPersonPayload] = mapped_column(
        ProtectedPayloadJSON(RelatedPersonPayload),
        nullable=False,
    )

    __table_args__ = (
        # Target columns for the composite foreign keys from `important_dates`.
        # Without this uniqueness, an important date could not carry its
        # person's space and privacy class at the database level.
        UniqueConstraint(
            "id",
            "space_id",
            "privacy_class",
            name="uq_related_persons_person_link",
        ),
        UniqueConstraint(
            "avatar_attachment_id",
            name="uq_related_persons_avatar_attachment",
        ),
        CheckConstraint(
            "relationship IN ('CHILD', 'PARENT', 'SIBLING', 'FRIEND', 'OTHER')",
            name="relationship_is_known",
        ),
        CheckConstraint(
            "birthday IS NOT NULL OR birthday_year_known IS FALSE",
            name="known_year_needs_a_birthday",
        ),
        CheckConstraint(
            f"birthday IS NULL OR birthday_year_known IS TRUE "
            f"OR EXTRACT(YEAR FROM birthday) = {UNKNOWN_BIRTH_YEAR}",
            name="unknown_year_is_normalized",
        ),
        CheckConstraint(
            "show_birthday_on_dashboard IS FALSE OR birthday IS NOT NULL",
            name="dashboard_visibility_needs_a_birthday",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )


class ImportantDate(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A date important to the couple, usually linked to a related person.

    `related_person_id` is optional: the couple's own anniversary belongs to
    nobody else. When set, the row carries a copy of the person's privacy
    class, and both values together form a foreign key. This achieves two
    things at once that would otherwise require two service checks:

    - The space must match. An important date cannot point to a person from
      another space, even due to a bug in domain logic.
    - An important date is never more open than its person. A `SPACE_SHARED`
      date attached to an `OWNER_ONLY` person would reveal that the person
      exists, which is exactly what the private record must prevent.

    `ON UPDATE CASCADE` keeps the copy current, while `ON DELETE CASCADE`
    removes dates for a deleted person. `SET NULL` is not possible here:
    `space_id` is part of the same foreign key and may not become null.
    """

    __tablename__ = "important_dates"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Important date not found.", "IMPORTANT_DATE_NOT_FOUND"
    )

    related_person_id: Mapped[UUID | None] = mapped_column(postgresql.UUID(as_uuid=True))
    related_person_privacy_class: Mapped[str | None] = mapped_column(String(12))
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    repeats: Mapped[str] = mapped_column(String(16), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[ImportantDatePayload] = mapped_column(
        ProtectedPayloadJSON(ImportantDatePayload),
        nullable=False,
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["related_person_id", "space_id", "related_person_privacy_class"],
            [
                "related_persons.id",
                "related_persons.space_id",
                "related_persons.privacy_class",
            ],
            name="fk_important_dates_related_person",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        CheckConstraint(
            "type IN ('BIRTHDAY', 'ANNIVERSARY', 'CUSTOM')",
            name="type_is_known",
        ),
        CheckConstraint("repeats IN ('NONE', 'ANNUALLY')", name="repeats_is_known"),
        CheckConstraint(
            "(related_person_id IS NULL) = (related_person_privacy_class IS NULL)",
            name="person_link_is_complete",
        ),
        CheckConstraint(
            "related_person_privacy_class IS DISTINCT FROM 'OWNER_ONLY' "
            "OR privacy_class = 'OWNER_ONLY'",
            name="never_more_open_than_its_person",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index(
            "ix_important_dates_space_id_related_person_id",
            "space_id",
            "related_person_id",
        ),
        Index("ix_important_dates_space_id_date", "space_id", "date"),
        Index("ix_important_dates_owner_id", "owner_id"),
    )
