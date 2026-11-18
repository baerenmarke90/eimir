"""Persistence for related people and important dates.

A child, parent, or friend: for eimir. these are not accounts. They do
not sign in, have no session, and receive no invitation. They are records
maintained by a partner in their space and therefore contain data about
third parties who cannot manage those records themselves. For that reason,
less is stored here than would technically be possible: display name,
relationship type, a birthday and an optional bounded note. No structured
address, school, or phone-number collection.

The display name, note, birthday, relationship and label of an important date
are the protected parts and are stored as `ProtectedPayload`, separate from
metadata. Everything needed for linking and later reminders - the date of an
important date, recurrence, and visibility - remains queryable as columns.

Who a person is to the couple (mother, friend, colleague) was such a column
until the Product Owner decision of 2026-11-17 (#797): together with a reminder
it told a dump that a Space has a mother whose birthday is on a given day. The
list of people is small per Space and is ordered in the application instead.

A person's birthday was such a column until the Product Owner decision of
2026-11-16 (#797). What stays visible outside the payload is that a birthday
exists (`has_birthday`) and, through its reminder, on which day of the year it
falls: the server has to know when to remind. The year is only in the payload.
"""

from __future__ import annotations

from datetime import date
from enum import StrEnum
from typing import Any, ClassVar
from uuid import UUID

from pydantic import Field, field_validator
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
    or_,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.elements import ColumnElement

from eimir.authorization import (
    PrivateResourceMixin,
    ResourceAbsence,
    SharedWrite,
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
    DAUGHTER = "DAUGHTER"
    SON = "SON"
    MOTHER = "MOTHER"
    FATHER = "FATHER"
    SISTER = "SISTER"
    BROTHER = "BROTHER"
    GRANDMOTHER = "GRANDMOTHER"
    GRANDFATHER = "GRANDFATHER"
    GRANDDAUGHTER = "GRANDDAUGHTER"
    GRANDSON = "GRANDSON"
    MOTHER_IN_LAW = "MOTHER_IN_LAW"
    FATHER_IN_LAW = "FATHER_IN_LAW"
    AUNT = "AUNT"
    UNCLE = "UNCLE"
    COUSIN = "COUSIN"
    RELATIVE = "RELATIVE"
    ACQUAINTANCE = "ACQUAINTANCE"
    COLLEAGUE = "COLLEAGUE"


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

The database enforced the placeholder while the birthday was a column. It now
lives in the protected payload, which the database cannot inspect, so
`people.service.normalize_birthday` is the one place that applies it; the
check constraint still guards a value left in the legacy column.
"""


class RelatedPersonPayload(ProtectedPayload):
    """Protected plaintext for a related person."""

    display_name: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=2000)
    birthday: date | None = None
    # None only on a row whose relationship is still in its legacy column.
    relationship: str | None = None

    @field_validator("relationship")
    @classmethod
    def relationship_is_known(cls, value: str | None) -> str | None:
        # The database check of the same name can only see the legacy column.
        if value is not None and value not in {item.value for item in PersonRelationship}:
            raise ValueError("Unknown relationship.")
        return value


class ImportantDatePayload(ProtectedPayload):
    """Protected label of an important date."""

    label: str = Field(min_length=1, max_length=120)


class RelatedPerson(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """A person related to the couple who does not have an account."""

    __tablename__ = "related_persons"
    # PO decision #1683: people belong to both members; ownership is provenance.
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Related person not found.", "RELATED_PERSON_NOT_FOUND"
    )

    # Legacy plaintext homes of the relationship and the birthday. New writes
    # keep them NULL and store both in ``payload``; a row written before that
    # still carries them here until the column backfill
    # (``eimir.security.column_moves``) has visited it. Read and assign
    # ``relationship`` and ``birthday`` below, never these.
    legacy_relationship: Mapped[str | None] = mapped_column("relationship", String(16))
    legacy_birthday: Mapped[date | None] = mapped_column("birthday", Date)
    # The one fact queries and constraints still need in SQL: whether a birthday
    # is recorded. It says nothing about when.
    has_birthday: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
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
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="people_are_shared"),
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
            "relationship IN (" + ", ".join(f"'{value}'" for value in PersonRelationship) + ")",
            name="relationship_is_known",
        ),
        # ``has_birthday`` stands for a birthday in the payload, the column for one
        # not yet moved there.
        CheckConstraint(
            "has_birthday OR birthday IS NOT NULL OR birthday_year_known IS FALSE",
            name="known_year_needs_a_birthday",
        ),
        CheckConstraint(
            f"birthday IS NULL OR birthday_year_known IS TRUE "
            f"OR EXTRACT(YEAR FROM birthday) = {UNKNOWN_BIRTH_YEAR}",
            name="unknown_year_is_normalized",
        ),
        CheckConstraint(
            "show_birthday_on_dashboard IS FALSE OR has_birthday OR birthday IS NOT NULL",
            name="dashboard_visibility_needs_a_birthday",
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )

    def __init__(
        self,
        *,
        birthday: date | None = None,
        relationship: str | None = None,
        **values: Any,
    ) -> None:
        """Accept birthday and relationship by their own keywords and store them in the payload."""
        payload = values.get("payload")
        if payload is not None:
            update: dict[str, Any] = {}
            if birthday is not None:
                update["birthday"] = birthday
            if relationship is not None:
                update["relationship"] = relationship
            if update:
                # Validated, unlike ``model_copy``: an unknown relationship is refused.
                payload = values["payload"] = type(payload)(**{**payload.seal(), **update})
            values.setdefault("has_birthday", payload.birthday is not None)
        super().__init__(**values)

    @classmethod
    def with_birthday(cls) -> ColumnElement[bool]:
        """SQL filter for people who have a birthday.

        The flag covers every row the application wrote; the column test covers a
        row that arrived with its birthday still in the legacy column, such as one
        imported from an older Transfer Bundle, before the backfill reached it.
        """
        return or_(cls.has_birthday.is_(True), cls.legacy_birthday.is_not(None))

    @property
    def birthday(self) -> date | None:
        """The birthday, from the protected payload or, for a legacy row, its column."""
        stored = self.payload.birthday
        return stored if stored is not None else self.legacy_birthday

    @birthday.setter
    def birthday(self, value: date | None) -> None:
        self.payload = self.payload.model_copy(update={"birthday": value})
        self.legacy_birthday = None
        self.has_birthday = value is not None

    @property
    def relationship(self) -> str:
        """The relationship, from the protected payload or, for a legacy row, its column."""
        stored = self.payload.relationship
        if stored is not None:
            return stored
        return self.legacy_relationship or PersonRelationship.OTHER.value

    @relationship.setter
    def relationship(self, value: str) -> None:
        self.payload = RelatedPersonPayload(**{**self.payload.seal(), "relationship": value})
        self.legacy_relationship = None


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
