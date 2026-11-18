"""Persistence for shared M3 places."""

from __future__ import annotations

from decimal import Decimal
from typing import ClassVar, Self

from pydantic import Field, model_validator
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Index,
    Numeric,
    SmallInteger,
    UniqueConstraint,
    or_,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.elements import ColumnElement

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

COORDINATE_PLACES = 6
"""Number of persisted decimal places (M3-D06).

Six decimal places are roughly eleven centimeters. More would not add real
accuracy; it would only make a more precise statement about where two people
were, which must not be created without intent.
"""

LATITUDE_LIMIT = Decimal(90)
LONGITUDE_LIMIT = Decimal(180)


class PlacePayload(ProtectedPayload):
    """Protected text content of a place.

    Name, description, address and coordinates live behind the
    protected-payload boundary. Coordinates were typed plain columns under
    M3-D06; the Product Owner decision of 2026-11-16 (#797) moved them here so
    that a database dump no longer shows where a couple's places are. The pair
    and range rules of M3-D06 are kept by the validator below. They remain
    sensitive content and must appear in no log, event, or metric label.
    """

    name: str
    description: str | None = None
    address: str | None = None
    geocoding_source: str | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates_are_a_pair(self) -> Self:
        # Half a coordinate is not a place but a latitude (M3-D06).
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude and longitude must be given together.")
        return self


class Place(
    IdMixin,
    TimestampMixin,
    VersionMixin,
    PrivateResourceMixin,
    Base,
):
    """A shared place.

    A place may exist without coordinates - many places meaningful to a
    couple are just a name. There is no deduplication: two places with the
    same name are two places. Merging them without an explicit request would
    be an unsolicited data mutation (M3-D07).
    """

    __tablename__ = "places"

    privacy_absence: ClassVar[ResourceAbsence] = ResourceAbsence(
        "Place not found.", "PLACE_NOT_FOUND"
    )
    shared_write: ClassVar[SharedWrite] = SharedWrite.COLLABORATIVE

    # 90.000000 needs eight digits, 180.000000 nine. Use Numeric rather than
    # Float: a coordinate is a decimal number with fixed precision, and binary
    # rounding would shift it slightly on every write.
    # These two columns are the legacy plaintext home of the coordinates. New
    # writes keep them NULL and store the pair in the payload; a row written
    # before that still carries them here until the column backfill
    # (``eimir.security.column_moves``) has visited it. Read ``latitude`` and
    # ``longitude`` below, never these.
    legacy_latitude: Mapped[Decimal | None] = mapped_column(
        "latitude", Numeric(8, COORDINATE_PLACES)
    )
    legacy_longitude: Mapped[Decimal | None] = mapped_column(
        "longitude", Numeric(9, COORDINATE_PLACES)
    )
    # The one fact queries still need in SQL: whether the place can be put on a
    # map. It says nothing about where.
    has_coordinates: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    crypto_version: Mapped[int] = mapped_column(
        SmallInteger,
        nullable=False,
        default=CRYPTO_VERSION_PLAINTEXT,
        server_default=text("0"),
    )
    payload: Mapped[PlacePayload] = mapped_column(
        ProtectedPayloadJSON(PlacePayload),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        # Both or neither (M3-D06). Half a coordinate is not a place but a
        # latitude, and would make a map jump somewhere unintended.
        CheckConstraint(
            "(latitude IS NULL) = (longitude IS NULL)",
            name="coordinates_are_a_pair",
        ),
        CheckConstraint(
            "latitude IS NULL OR (latitude >= -90 AND latitude <= 90)",
            name="latitude_within_range",
        ),
        CheckConstraint(
            "longitude IS NULL OR (longitude >= -180 AND longitude <= 180)",
            name="longitude_within_range",
        ),
        # Supports the composite foreign key from `plans`, just as `wishes`
        # supports the one for `source_wish_id`.
        UniqueConstraint("id", "space_id", name="uq_places_id_space_id"),
        Index("ix_places_owner_id", "owner_id"),
        Index("ix_places_space_id_created_at_id", "space_id", "created_at", "id"),
    )

    @classmethod
    def located(cls) -> ColumnElement[bool]:
        """SQL filter for places that have a position.

        The flag covers every row the application wrote; the column test covers a
        row that arrived with its position still in the legacy column, such as one
        imported from an older Transfer Bundle, before the backfill reached it.
        """
        return or_(cls.has_coordinates.is_(True), cls.legacy_latitude.is_not(None))

    @property
    def latitude(self) -> Decimal | None:
        """The latitude, from the protected payload or, for a legacy row, its column."""
        stored = self.payload.latitude
        return stored if stored is not None else self.legacy_latitude

    @property
    def longitude(self) -> Decimal | None:
        """The longitude, from the protected payload or, for a legacy row, its column."""
        stored = self.payload.longitude
        return stored if stored is not None else self.legacy_longitude


def shared_privacy() -> PrivacyClass:
    """A place is always shared space content (M3-D06)."""
    return PrivacyClass.SPACE_SHARED
