"""Store the personal memory world next to the other appearance choices (#2283).

Revision ID: 0179
Revises: 0178
"""

import sqlalchemy as sa
from alembic import op

revision = "0179"
down_revision = "0178"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL keeps the default Story presentation.
    op.add_column(
        "app_icon_preferences",
        sa.Column("memory_world", sa.String(24), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_icon_preferences", "memory_world")
