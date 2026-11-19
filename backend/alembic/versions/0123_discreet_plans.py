"""Discreet presentation on shared Plans (#1790 F3).

Existing Plans stay unchanged: ``discreet`` defaults to false. The preview
title is authored content and lives in the protected payload, so it needs no
column.

Revision ID: 0123
Revises: 0122
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0123"
down_revision = "0122"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "plans",
        sa.Column("discreet", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "plans",
        sa.Column(
            "discreet_title_mode",
            sa.String(length=16),
            nullable=False,
            server_default=sa.text("'PREVIEW'"),
        ),
    )
    op.create_check_constraint(
        "discreet_title_mode_is_known",
        "plans",
        "discreet_title_mode IN ('PREVIEW', 'ORIGINAL')",
    )


def downgrade() -> None:
    op.drop_constraint("discreet_title_mode_is_known", "plans", type_="check")
    op.drop_column("plans", "discreet_title_mode")
    op.drop_column("plans", "discreet")
