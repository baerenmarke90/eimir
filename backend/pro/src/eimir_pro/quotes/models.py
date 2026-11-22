"""Persistence models for personal daily quote preferences."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


class DailyQuotePreference(IdMixin, TimestampMixin, VersionMixin, Base):
    """Personal Daily Quote preferences for one Account.

    Preferences are Account-scoped and personal:
    - Each partner configures their own source and category preferences.
    - Partners cannot see or modify each other's preferences.
    - Does not modify or bloat the global profile identity table.
    """

    __tablename__ = "daily_quote_preferences"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    selected_source_ids: Mapped[list[str]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    selected_category_ids: Mapped[list[str]] = mapped_column(
        postgresql.JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    locale: Mapped[str | None] = mapped_column(
        String(16),
        nullable=True,
    )
