"""Extend personal appearance with the Wir composition choice.

Revision ID: 0090
Revises: 0089
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op

revision = "0090"
down_revision = "0089"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "app_icon_preferences",
        sa.Column("wir_design", sa.String(24), nullable=False, server_default="warm"),
    )


def downgrade() -> None:
    op.drop_column("app_icon_preferences", "wir_design")
