"""Index shared experience projections without moving authored content.

Revision ID: 0105
Revises: 0104
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0105"
down_revision = "0104"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("memories", sa.Column("experience_root_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_memories_experience_root",
        "memories",
        "memories",
        ["experience_root_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_memories_space_experience_root", "memories", ["space_id", "experience_root_id"]
    )
    op.create_index(
        "ix_memories_ungrouped_experience",
        "memories",
        ["space_id"],
        postgresql_where=sa.text("experience_kind IS NOT NULL AND experience_root_id IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_memories_ungrouped_experience", "memories")
    op.drop_index("ix_memories_space_experience_root", "memories")
    op.drop_constraint("fk_memories_experience_root", "memories", type_="foreignkey")
    op.drop_column("memories", "experience_root_id")
