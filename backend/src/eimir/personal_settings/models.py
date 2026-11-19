"""Personal settings documents: one per Account, and one per Account and Space.

A person's deliberate choices of how the app looks or behaves for them (theme,
diary layout, garden feedback, display choices) used to live only in the
browser storage of one device. These documents let every signed-in device
apply the same choices.

The schema is closed and versioned: only the allowlisted keys below are
stored, each with a fixed value type. Device-bound state (push registration,
location permission, once-message keys, caches, drafts, read and dismissal
markers) never belongs here.

Nothing in these documents grants a capability. A display opt-in for a Pro
surface is only a personal wish; the surface itself stays gated by the live
entitlement on every read.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import ForeignKey, Index, SmallInteger, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin

SCHEMA_VERSION = 1
"""Version of the allowlisted key set; raise it when a key changes meaning."""


class ThemePreference(StrEnum):
    SYSTEM = "system"
    LIGHT = "light"
    DARK = "dark"


class DiaryLayout(StrEnum):
    ALBUM = "album"
    COMPACT = "compact"


class _Settings(BaseModel):
    """Stored document shape. Absent or ``None`` means "no saved choice"."""

    model_config = ConfigDict(extra="ignore", frozen=True)

    def stored(self) -> dict[str, Any]:
        return self.model_dump(mode="json", exclude_none=True)


class AccountSettings(_Settings):
    """Choices that apply to the person everywhere, independent of the Space."""

    theme: ThemePreference | None = None
    diary_layout: DiaryLayout | None = None
    garden_sound: bool | None = None
    garden_vibration: bool | None = None


class SpaceSettings(_Settings):
    """Choices that apply to the person in one Space only."""

    occasion_holidays: bool | None = None
    wir_statistics: bool | None = None


class PersonalSettings(IdMixin, TimestampMixin, VersionMixin, Base):
    """One owner-only settings document.

    ``space_id`` is NULL for the Account-wide document. Partial unique indexes
    keep exactly one Account-wide document and at most one document per Space.
    """

    __tablename__ = "personal_settings"
    __table_args__ = (
        Index(
            "uq_personal_settings_account_id",
            "account_id",
            unique=True,
            postgresql_where=text("space_id IS NULL"),
        ),
        Index(
            "uq_personal_settings_account_id_space_id",
            "account_id",
            "space_id",
            unique=True,
            postgresql_where=text("space_id IS NOT NULL"),
        ),
    )

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    schema_version: Mapped[int] = mapped_column(
        SmallInteger, nullable=False, default=SCHEMA_VERSION
    )
    # Validated through AccountSettings/SpaceSettings on every read and write.
    settings: Mapped[dict[str, Any]] = mapped_column(postgresql.JSONB, nullable=False, default=dict)
