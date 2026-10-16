"""Store optional Account-owned Quiet Hours in local wall time.

Revision ID: 0079
Revises: 0078
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0079"
down_revision = "0078"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("accounts", sa.Column("quiet_hours_start", sa.Time(), nullable=True))
    op.add_column("accounts", sa.Column("quiet_hours_end", sa.Time(), nullable=True))
    op.create_check_constraint(
        "account_quiet_hours_boundaries_valid",
        "accounts",
        "(quiet_hours_start IS NULL AND quiet_hours_end IS NULL) OR "
        "(quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL "
        "AND quiet_hours_start <> quiet_hours_end "
        "AND EXTRACT(SECOND FROM quiet_hours_start) = 0 "
        "AND EXTRACT(SECOND FROM quiet_hours_end) = 0)",
    )


def downgrade() -> None:
    op.drop_constraint("account_quiet_hours_boundaries_valid", "accounts", type_="check")
    op.drop_column("accounts", "quiet_hours_end")
    op.drop_column("accounts", "quiet_hours_start")
