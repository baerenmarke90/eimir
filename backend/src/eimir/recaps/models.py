"""Recap metadata, protected presentation and canonical source references."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import ClassVar
from uuid import UUID

from pydantic import Field
from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.authorization import PrivacyClass, PrivateResourceMixin, ResourceAbsence
from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin
from eimir.db.protected_payload import ProtectedPayloadJSON
from eimir.domain.payload import ProtectedPayload


class RecapKind(StrEnum):
    MONTH = "MONTH"
    YEAR = "YEAR"


class RecapSourceKind(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"
    CHAPTER = "CHAPTER"
    PLAN = "PLAN"


class MoodBucket(ProtectedPayload):
    """Mutual check-in days of one week (month edition) or one month (year edition)."""

    index: int = Field(ge=1, le=12)
    mutual_days: int = Field(ge=0, le=31)
    good_days: int = Field(ge=0, le=31)


class MoodRhythm(ProtectedPayload):
    """Frozen aggregate; never an individual value, ranking or relationship claim."""

    buckets: list[MoodBucket] = Field(max_length=12)
    leading: int | None = None


class FilmMedia(ProtectedPayload):
    """A curated picture of a moment; a video carries the short muted clip it plays."""

    attachment_id: UUID
    parent_id: UUID
    video: bool = False
    clip_start: float | None = None
    clip_seconds: float | None = None
    # Presentation hints measured on the thumbnail: format and crop centre.
    shape: str | None = Field(default=None, max_length=16)
    focus_x: float | None = Field(default=None, ge=0, le=1)
    focus_y: float | None = Field(default=None, ge=0, le=1)


class FilmLook(ProtectedPayload):
    """Design variants chosen once per edition from a fixed catalogue (``recaps.film``)."""

    mood: str = Field(max_length=16)
    transitions: list[str] = Field(min_length=2, max_length=2)
    cover: str = Field(max_length=16)
    motions: list[str] = Field(max_length=5)
    layouts: dict[str, list[str]] = Field(default_factory=dict)
    # Additive since the variety catalogue; older editions read with defaults.
    accents: list[str] = Field(default_factory=list, max_length=3)
    pace: str | None = Field(default=None, max_length=16)


class RecapFilm(ProtectedPayload):
    """A recap film: frozen look, guaranteed highlight and curated media per source.

    A year film also names the highlight of every month chapter, keyed by the
    month number. Scores and selection reasons are never stored or served.
    """

    look: FilmLook
    highlight_key: str | None = None
    months: dict[str, str] = Field(default_factory=dict, max_length=12)
    media: dict[str, list[FilmMedia]] = Field(default_factory=dict)


class RecapPayload(ProtectedPayload):
    headline: str | None = None
    introduction: str | None = None
    mood: MoodRhythm | None = None
    film: RecapFilm | None = None


class RecapEdition(IdMixin, TimestampMixin, VersionMixin, Base):
    """A Space-shared derived edition, never an owner-only source collection."""

    __tablename__ = "recap_editions"
    privacy_class: ClassVar[PrivacyClass] = PrivacyClass.SPACE_SHARED

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(8), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    variant: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    locale: Mapped[str] = mapped_column(String(16), nullable=False)
    starts_on: Mapped[date] = mapped_column(Date, nullable=False)
    through_on: Mapped[date] = mapped_column(Date, nullable=False)
    is_partial: Mapped[bool] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="PENDING")
    theme: Mapped[str] = mapped_column(String(20), nullable=False, default="MIXED")
    generated_by: Mapped[str] = mapped_column(String(16), nullable=False, default="RULES")
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    customized: Mapped[bool] = mapped_column(nullable=False, default=False)
    request_token: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), nullable=False)
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default=text("0")
    )
    payload: Mapped[RecapPayload] = mapped_column(
        ProtectedPayloadJSON(RecapPayload), nullable=False, default=RecapPayload
    )
    # Late-entry tracking (#1744): the material fingerprint this composition
    # accounted for, the database time it was taken, and a change the scan has
    # seen but not yet acted on because the period was not quiet yet.
    material_digest: Mapped[str | None] = mapped_column(String(32))
    material_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    observed_digest: Mapped[str | None] = mapped_column(String(32))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The one readiness notice a retained edition earns, and when it was handled.
    announcement: Mapped[str | None] = mapped_column(String(8))
    announced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # A newer version of a retained edition points back to the edition it extends.
    supersedes_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True), ForeignKey("recap_editions.id", ondelete="SET NULL")
    )

    __table_args__ = (
        UniqueConstraint("id", "space_id", name="uq_recap_editions_id_space"),
        CheckConstraint(
            "announcement IS NULL OR announcement IN ('READY', 'GREW', 'EARLIER')",
            name="announcement_is_known",
        ),
        Index(
            "ix_recap_editions_unannounced",
            "space_id",
            postgresql_where=text("announcement IS NOT NULL AND announced_at IS NULL"),
        ),
        Index("ix_recap_editions_supersedes", "supersedes_id"),
        CheckConstraint("kind IN ('MONTH', 'YEAR')", name="kind_is_known"),
        CheckConstraint(
            "(kind = 'MONTH' AND month BETWEEN 1 AND 12) OR (kind = 'YEAR' AND month = 0)",
            name="period_is_valid",
        ),
        CheckConstraint("year BETWEEN 1900 AND 2100", name="year_is_bounded"),
        CheckConstraint("variant BETWEEN 0 AND 3", name="variant_is_bounded"),
        CheckConstraint(
            "status IN ('PENDING', 'READY', 'EMPTY', 'PAUSED')", name="status_is_known"
        ),
        CheckConstraint("through_on >= starts_on", name="date_range_is_valid"),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        Index("ix_recap_editions_space_period", "space_id", "year", "month"),
        Index(
            "uq_recap_editions_live_period",
            "space_id",
            "kind",
            "year",
            "month",
            "variant",
            unique=True,
            postgresql_where=text("saved_at IS NULL"),
        ),
    )


class RecapSource(Base):
    """Metadata-only canonical reference; original content is always reauthorized."""

    __tablename__ = "recap_sources"
    edition_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("recap_editions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    source_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    source_version: Mapped[int] = mapped_column(Integer, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    __table_args__ = (
        CheckConstraint(
            "kind IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE', 'CHAPTER', 'PLAN')",
            name="kind_is_known",
        ),
        Index("ix_recap_sources_original", "kind", "source_id"),
    )


class RecapReflectionPayload(ProtectedPayload):
    text: str


class RecapReflection(IdMixin, TimestampMixin, VersionMixin, PrivateResourceMixin, Base):
    """Separate owner-only draft and deliberately shared reflection rows."""

    __tablename__ = "recap_reflections"
    privacy_absence = ResourceAbsence("Reflection not found.", "RESOURCE_NOT_FOUND")
    edition_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("recap_editions.id", ondelete="CASCADE"),
        nullable=False,
    )
    crypto_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=0, server_default=text("0")
    )
    payload: Mapped[RecapReflectionPayload] = mapped_column(
        ProtectedPayloadJSON(RecapReflectionPayload), nullable=False
    )
    __table_args__ = (
        ForeignKeyConstraint(
            ["edition_id", "space_id"],
            ["recap_editions.id", "recap_editions.space_id"],
            name="fk_recap_reflections_edition_space",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "edition_id", "owner_id", "privacy_class", name="uq_recap_reflections_owner_visibility"
        ),
        CheckConstraint(
            "privacy_class IN ('SPACE_SHARED', 'OWNER_ONLY')", name="privacy_is_enforceable"
        ),
        CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
