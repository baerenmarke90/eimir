"""Add privacy-minimized intentional Story-view aggregates.

Revision ID: 0056
Revises: 0055
Create Date: 2026-09-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "story_item_view_aggregates",
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("viewer_account_id", UUID, nullable=False),
        sa.Column("item_kind", sa.String(length=16), nullable=False),
        sa.Column("item_id", UUID, nullable=False),
        sa.Column("distinct_view_days_capped", sa.SmallInteger(), nullable=False),
        sa.Column("last_counted_local_date", sa.Date(), nullable=False),
        sa.Column("last_viewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint(
            "space_id",
            "viewer_account_id",
            "item_kind",
            "item_id",
            name="pk_story_item_view_aggregates",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_story_item_view_aggregates_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["viewer_account_id"],
            ["accounts.id"],
            name="fk_story_item_view_aggregates_viewer_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "item_kind IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE')",
            name="item_kind_is_story_kind",
        ),
        sa.CheckConstraint(
            "distinct_view_days_capped BETWEEN 1 AND 5",
            name="score_is_bounded",
        ),
    )
    op.create_index(
        "ix_story_item_view_aggregates_target_viewer",
        "story_item_view_aggregates",
        ["space_id", "item_kind", "item_id", "viewer_account_id"],
    )
    op.create_index(
        "ix_story_item_view_aggregates_viewer_last_viewed",
        "story_item_view_aggregates",
        ["space_id", "viewer_account_id", "last_viewed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_story_item_view_aggregates_viewer_last_viewed",
        table_name="story_item_view_aggregates",
    )
    op.drop_index(
        "ix_story_item_view_aggregates_target_viewer",
        table_name="story_item_view_aggregates",
    )
    op.drop_table("story_item_view_aggregates")
