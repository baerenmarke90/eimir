"""Add an optional inclusive last calendar day to date-only Plans (#1895).

Existing Plans stay single-day: ``planned_until`` defaults to NULL. Only a
date-only schedule may carry it; timed Plans keep ``planned_end``.

Revision ID: 0133
Revises: 0132
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0133"
down_revision = "0132"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("planned_until", sa.Date(), nullable=True))
    op.create_check_constraint(
        "planned_until_extends_planned_on",
        "plans",
        "planned_until IS NULL OR (planned_on IS NOT NULL AND planned_until >= planned_on)",
    )


def downgrade() -> None:
    op.drop_constraint("planned_until_extends_planned_on", "plans", type_="check")
    op.drop_column("plans", "planned_until")
