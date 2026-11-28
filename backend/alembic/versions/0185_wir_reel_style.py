"""Store the personal Wir reel style next to the other appearance choices (#2345).

Revision ID: 0185
Revises: 0184
"""

import sqlalchemy as sa
from alembic import op

revision = "0185"
down_revision = "0184"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL keeps the default circles.
    op.add_column(
        "app_icon_preferences",
        sa.Column("wir_reel_style", sa.String(24), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("app_icon_preferences", "wir_reel_style")
