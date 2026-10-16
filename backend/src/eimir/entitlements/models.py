"""Persistence models and enum definitions for commercial capability entitlements."""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class EntitlementSourceType(StrEnum):
    """Normalized origin of an entitlement grant."""

    GOOGLE_PLAY = "GOOGLE_PLAY"
    CLOUD_STRIPE = "CLOUD_STRIPE"
    SELF_HOSTED_KEY = "SELF_HOSTED_KEY"
    ADMIN_GRANT = "ADMIN_GRANT"
    TEST_FIXTURE = "TEST_FIXTURE"


class EntitlementStatus(StrEnum):
    """Lifecycle state of an entitlement grant."""

    ACTIVE = "ACTIVE"
    TRIAL = "TRIAL"
    GRACE_PERIOD = "GRACE_PERIOD"
    EXPIRED = "EXPIRED"
    REVOKED = "REVOKED"
    GRANDFATHERED = "GRANDFATHERED"


class EntitlementTier(StrEnum):
    """High-level commercial product tier."""

    FREE = "FREE"
    PREMIUM = "PREMIUM"


class Capability(StrEnum):
    """Standard normalized domain capability identifiers."""

    STORAGE_CLOUD_QUOTA_50GB = "storage.cloud_quota_50gb"
    CHAPTER_RICH_PRESENTATION = "chapter.rich_presentation"
    OCCASION_AUTOMATION = "occasion.automation"
    RECAP_PDF_YEARBOOK = "recap.pdf_yearbook"
    RECAP_VIDEO_MONTAGE = "recap.video_montage"
    QUESTION_5_YEAR_MIRROR = "question.5_year_mirror"
    SURPRISE_MODE_VAULT = "surprise_mode.vault"
    THEME_BESPOKE_PACKS = "theme.bespoke_packs"
    INTEGRATION_EXTERNAL_SYNC = "integration.external_sync"
    GAMES_COUPLE = "games.couple"
    DAILY_INSIGHTS = "daily.insights"
    DAILY_QUOTE = "daily.quote"
    PARTNER_QUICK_ACTIONS_EXTENDED = "partner.quick_actions.extended"


class EntitlementGrant(IdMixin, TimestampMixin, Base):
    """A commercial grant assigned to a shared relationship Space.

    Entitlements are couple/space-scoped. If either partner purchases
    or applies a grant, it binds to ``space_id``. ``account_id`` retains
    the purchasing/sponsoring account reference for restore and billing
    purposes.
    """

    __tablename__ = "entitlement_grants"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    account_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    external_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_event_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    tier: Mapped[str] = mapped_column(
        String(32), nullable=False, default=EntitlementTier.FREE.value
    )
    effective_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    effective_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capabilities: Mapped[list[str] | None] = mapped_column(postgresql.JSONB, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        postgresql.JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
        default=dict,
    )

    __table_args__ = (
        CheckConstraint(
            "source_type IN ("
            "'GOOGLE_PLAY', 'CLOUD_STRIPE', 'SELF_HOSTED_KEY', 'ADMIN_GRANT', 'TEST_FIXTURE'"
            ")",
            name="entitlement_source_type_valid",
        ),
        CheckConstraint(
            "status IN ('ACTIVE', 'TRIAL', 'GRACE_PERIOD', 'EXPIRED', 'REVOKED', 'GRANDFATHERED')",
            name="entitlement_status_valid",
        ),
        CheckConstraint(
            "tier IN ('FREE', 'PREMIUM')",
            name="entitlement_tier_valid",
        ),
        UniqueConstraint(
            "source_type",
            "external_reference",
            name="uq_entitlement_grants_source_reference",
        ),
        Index("ix_entitlement_grants_space_id_status", "space_id", "status"),
    )
