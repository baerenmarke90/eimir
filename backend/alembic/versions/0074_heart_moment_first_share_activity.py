"""Keep one Activity entry for the first shared visibility of a HeartMoment.

Revision ID: 0074
Revises: 0073
Create Date: 2026-09-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0074"
down_revision = "0073"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_activities_heart_moment_created_target",
        "activities",
        ["space_id", "target_id"],
        unique=True,
        postgresql_where=sa.text("kind = 'HEART_MOMENT_CREATED' AND target_type = 'HEART_MOMENT'"),
    )


def downgrade() -> None:
    op.drop_index("uq_activities_heart_moment_created_target", table_name="activities")
