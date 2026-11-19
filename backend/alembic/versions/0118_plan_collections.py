"""Link independent shared Collections to Plans with tenant-enforced keys.

Revision ID: 0118
Revises: 0117
"""

import sqlalchemy as sa
from alembic import op

revision = "0118"
down_revision = "0117"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_collections",
        sa.Column("plan_id", sa.UUID(), primary_key=True),
        sa.Column("collection_id", sa.UUID(), primary_key=True),
        sa.Column("space_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_by",
            sa.UUID(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["plan_id", "space_id"], ["plans.id", "plans.space_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["collection_id", "space_id"],
            ["collections.id", "collections.space_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_plan_collections_collection_id", "plan_collections", ["collection_id"])
    op.create_index("ix_plan_collections_space_id", "plan_collections", ["space_id"])


def downgrade() -> None:
    op.drop_table("plan_collections")
