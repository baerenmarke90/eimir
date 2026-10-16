"""Persist private Dashboard module order on the existing preference rows.

Revision ID: 0075
Revises: 0074
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0075"
down_revision = "0074"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dashboard_module_preferences", sa.Column("sort_position", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("dashboard_module_preferences", "sort_position")
