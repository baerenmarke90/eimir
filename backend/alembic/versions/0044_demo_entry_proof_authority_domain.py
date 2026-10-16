"""Separate public demo entry proofs from magic-link generation supersession.

Revision ID: 0044
Revises: 0043
Create Date: 2026-09-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "magic_link_tokens",
        sa.Column(
            "is_demo_entry",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("magic_link_tokens", "is_demo_entry")
