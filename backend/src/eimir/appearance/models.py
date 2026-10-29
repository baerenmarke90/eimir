"""Owner-only app-icon selection for an Account in one Space."""

from enum import StrEnum
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin, VersionMixin


class AppIconId(StrEnum):
    ORIGINAL = "original"
    SUNSET = "sunset"
    SAGE = "sage"
    DAYLIGHT = "daylight"
    LAVENDER = "lavender"
    SAND = "sand"
    MIDNIGHT = "midnight"
    PEARL = "pearl"
    DARK = "dark"
    MONOCHROME = "monochrome"
    MINIMAL = "minimal"


class WirDesignId(StrEnum):
    WARM = "warm"
    MODERN = "modern"
    CLASSIC = "classic"


class AppIconPreference(IdMixin, TimestampMixin, VersionMixin, Base):
    """Personal system metadata; partners do not share the selected icon."""

    __tablename__ = "app_icon_preferences"
    __table_args__ = (UniqueConstraint("account_id", "space_id"),)

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    icon_id: Mapped[str] = mapped_column(String(24), nullable=False)
    wir_design: Mapped[str] = mapped_column(
        String(24), nullable=False, default=WirDesignId.WARM.value, server_default="warm"
    )
