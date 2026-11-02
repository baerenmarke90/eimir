"""Allow shared Plans as comment parents.

Revision ID: 0100
Revises: 0099
"""

import sqlalchemy as sa
from alembic import op

revision = "0100"
down_revision = "0099"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("comment_target_type_allowed", "comments", type_="check")
    op.create_check_constraint(
        "comment_target_type_allowed",
        "comments",
        "target_type IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE', 'PLAN')",
    )


def downgrade() -> None:
    # Authored conversation must not be silently deleted by a schema rollback.
    if (
        op.get_bind()
        .execute(sa.text("SELECT 1 FROM comments WHERE target_type = 'PLAN' LIMIT 1"))
        .first()
    ):
        raise RuntimeError("Export and explicitly remove Plan comments before downgrading 0100.")
    op.drop_constraint("comment_target_type_allowed", "comments", type_="check")
    op.create_check_constraint(
        "comment_target_type_allowed",
        "comments",
        "target_type IN ('MEMORY', 'HEART_MOMENT', 'MILESTONE')",
    )
