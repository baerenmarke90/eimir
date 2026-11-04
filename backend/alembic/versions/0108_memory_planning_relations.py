"""Connect authored Memories to Plans and Wishes with tenant-enforced keys.

Revision ID: 0108
Revises: 0107
"""

import sqlalchemy as sa
from alembic import op

revision = "0108"
down_revision = "0107"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_plans_id_space_id", "plans", ["id", "space_id"])
    for plural, singular in (("plans", "plan"), ("wishes", "wish")):
        table = f"memory_{plural}"
        op.create_table(
            table,
            sa.Column("memory_id", sa.UUID(), primary_key=True),
            sa.Column(f"{singular}_id", sa.UUID(), primary_key=True),
            sa.Column("space_id", sa.UUID(), nullable=False),
            sa.Column(
                "created_by",
                sa.UUID(),
                sa.ForeignKey("accounts.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.func.now(),
            ),
            sa.ForeignKeyConstraint(
                ["memory_id", "space_id"], ["memories.id", "memories.space_id"], ondelete="CASCADE"
            ),
            sa.ForeignKeyConstraint(
                [f"{singular}_id", "space_id"],
                [f"{plural}.id", f"{plural}.space_id"],
                ondelete="CASCADE",
            ),
        )
        op.create_index(f"ix_{table}_{singular}_id", table, [f"{singular}_id"])
        op.create_index(f"ix_{table}_space_id", table, ["space_id"])


def downgrade() -> None:
    op.drop_table("memory_wishes")
    op.drop_table("memory_plans")
    op.drop_constraint("uq_plans_id_space_id", "plans", type_="unique")
