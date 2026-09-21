"""Persistence for private per-account Dashboard presentation preferences."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base
from eimir.db.mixins import IdMixin, TimestampMixin


class DashboardModulePreference(IdMixin, TimestampMixin, Base):
    """Personal presentation overrides for one Dashboard module in one Space."""

    __tablename__ = "dashboard_module_preferences"

    account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    module_key: Mapped[str] = mapped_column(String(64), nullable=False)
    item_limit: Mapped[int | None] = mapped_column(Integer)
    # Reserved for the common #817 seam. #848 neither reads nor exposes it.
    visible: Mapped[bool | None] = mapped_column(Boolean)
    selected_collection_id: Mapped[UUID | None] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(
            "collections.id",
            name="fk_dashboard_pref_selected_collection",
            ondelete="SET NULL",
        ),
    )

    __table_args__ = (
        UniqueConstraint(
            "account_id",
            "space_id",
            "module_key",
            name="uq_dashboard_module_preferences_account_space_module",
        ),
        Index(
            "ix_dashboard_module_preferences_space_account",
            "space_id",
            "account_id",
        ),
        Index(
            "ix_dashboard_module_preferences_selected_collection_id",
            "selected_collection_id",
        ),
    )
