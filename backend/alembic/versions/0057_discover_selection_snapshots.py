"""Add immutable daily Discover selection snapshots.

Revision ID: 0057
Revises: 0056
Create Date: 2026-09-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0057"
down_revision = "0056"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_index(
        "ix_heart_moments_space_id_happened_on",
        "heart_moments",
        ["space_id", "happened_on"],
    )
    op.create_table(
        "discover_selection_snapshots",
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("viewer_account_id", UUID, nullable=False),
        sa.Column("selection_date", sa.Date(), nullable=False),
        sa.Column("algorithm_version", sa.String(length=32), nullable=False),
        sa.Column(
            "ordered_item_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.PrimaryKeyConstraint(
            "space_id",
            "viewer_account_id",
            "selection_date",
            name="pk_discover_selection_snapshots",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_discover_selection_snapshots_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["viewer_account_id"],
            ["accounts.id"],
            name="fk_discover_selection_snapshots_viewer_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "jsonb_typeof(ordered_item_refs) = 'array'",
            name="ordered_item_refs_is_array",
        ),
        sa.CheckConstraint(
            "jsonb_array_length(ordered_item_refs) BETWEEN 0 AND 8",
            name="ordered_item_refs_is_bounded",
        ),
    )
    op.create_index(
        "ix_discover_selection_snapshots_created_at",
        "discover_selection_snapshots",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_discover_selection_snapshots_created_at",
        table_name="discover_selection_snapshots",
    )
    op.drop_table("discover_selection_snapshots")
    op.drop_index(
        "ix_heart_moments_space_id_happened_on",
        table_name="heart_moments",
    )
