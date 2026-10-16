"""Account-global profile identity version.

Revision ID: 0035
Revises: 0034
Create Date: 2026-08-31
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0035"
down_revision = "0034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.alter_column("accounts", "version", server_default=None)


def downgrade() -> None:
    op.drop_column("accounts", "version")
