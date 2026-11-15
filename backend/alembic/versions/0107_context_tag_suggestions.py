"""Add discardable encrypted tag proposals with typed parent ownership.

Revision ID: 0107
Revises: 0106
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0107"
down_revision = "0106"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_heart_moments_id_space_id", "heart_moments", ["id", "space_id"])
    op.create_table(
        "context_tag_suggestions",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "space_id", sa.UUID(), sa.ForeignKey("spaces.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("memory_id", sa.UUID()),
        sa.Column("heart_moment_id", sa.UUID()),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.CheckConstraint(
            "(memory_id IS NOT NULL)::integer + (heart_moment_id IS NOT NULL)::integer = 1",
            name="context_tag_one_parent",
        ),
        sa.CheckConstraint(
            "source_version > 0 AND crypto_version >= 0", name="context_tag_versions_valid"
        ),
        sa.ForeignKeyConstraint(
            ["memory_id", "space_id"], ["memories.id", "memories.space_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["heart_moment_id", "space_id"],
            ["heart_moments.id", "heart_moments.space_id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("memory_id", name="uq_context_tag_memory"),
        sa.UniqueConstraint("heart_moment_id", name="uq_context_tag_heart_moment"),
    )
    op.create_index(
        "ix_context_tag_space_generated", "context_tag_suggestions", ["space_id", "generated_at"]
    )


def downgrade() -> None:
    op.drop_table("context_tag_suggestions")
    op.drop_constraint("uq_heart_moments_id_space_id", "heart_moments", type_="unique")
