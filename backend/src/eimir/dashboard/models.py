"""Persistence for private per-account Dashboard presentation preferences."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    UniqueConstraint,
)
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
    sort_position: Mapped[int | None] = mapped_column(Integer)
    # Compatibility mirror of the first entry of ``DashboardModuleCollection``
    # (#1808). The association rows are authoritative; this column is only kept
    # in step so an application rollback still finds a valid single selection.
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


class DashboardModuleCollection(Base):
    """One shared list a person chose to show in a Dashboard module (#1808).

    A module that selects collections (``pinned_collection``) may show several
    lists. ``position`` keeps the person's order. The rows belong to the
    private per-account preference and disappear with it, or with the list.
    """

    __tablename__ = "dashboard_module_collections"

    preference_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(
            "dashboard_module_preferences.id",
            name="fk_dashboard_module_collections_preference",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    collection_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey(
            "collections.id",
            name="fk_dashboard_module_collections_collection",
            ondelete="CASCADE",
        ),
        primary_key=True,
    )
    position: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    __table_args__ = (
        CheckConstraint("position >= 0", name="position_is_non_negative"),
        UniqueConstraint(
            "preference_id",
            "position",
            name="uq_dashboard_module_collections_preference_id_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        Index("ix_dashboard_module_collections_collection_id", "collection_id"),
    )
