"""Privacy-minimized intentional Story-view aggregates."""

from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, SmallInteger, String
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Mapped, mapped_column

from eimir.db.base import Base


class StoryItemViewAggregate(Base):
    """One bounded view summary per viewer and shared Story item.

    This is deliberately not a view-event history. It retains only enough
    state for future long-unseen and coarse partner-affinity selection.
    """

    __tablename__ = "story_item_view_aggregates"

    space_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("spaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    viewer_account_id: Mapped[UUID] = mapped_column(
        postgresql.UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        primary_key=True,
    )
    item_kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    item_id: Mapped[UUID] = mapped_column(postgresql.UUID(as_uuid=True), primary_key=True)
    distinct_view_days_capped: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    last_counted_local_date: Mapped[date] = mapped_column(Date, nullable=False)
    last_viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    __table_args__ = (
        CheckConstraint(
            "item_kind IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE')",
            name="item_kind_is_story_kind",
        ),
        CheckConstraint(
            "distinct_view_days_capped BETWEEN 1 AND 5",
            name="score_is_bounded",
        ),
        Index(
            "ix_story_item_view_aggregates_target_viewer",
            "space_id",
            "item_kind",
            "item_id",
            "viewer_account_id",
        ),
        Index(
            "ix_story_item_view_aggregates_viewer_last_viewed",
            "space_id",
            "viewer_account_id",
            "last_viewed_at",
        ),
    )
