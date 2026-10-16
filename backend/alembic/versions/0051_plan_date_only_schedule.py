"""Add explicit date-only Plan schedules.

Revision ID: 0051
Revises: 0050
Create Date: 2026-09-11

#838 separates a calendar-day schedule from a timestamp schedule. Existing
``planned_start`` values remain untouched and therefore retain their exact
instant semantics; the new ``planned_on`` column is additive and receives no
backfill.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0051"
down_revision = "0050"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("planned_on", sa.Date(), nullable=True))

    # Pass logical constraint names here. The repository-wide SQLAlchemy
    # naming convention expands them to ck_plans_<name>; passing an already
    # expanded database name would incorrectly double-prefix it.
    op.drop_constraint("idea_has_no_schedule", "plans", type_="check")
    op.drop_constraint("planned_needs_start", "plans", type_="check")

    op.create_check_constraint(
        "schedule_has_single_start",
        "plans",
        "planned_on IS NULL OR planned_start IS NULL",
    )
    op.create_check_constraint(
        "idea_has_no_schedule",
        "plans",
        "status <> 'IDEA' OR "
        "(planned_on IS NULL AND planned_start IS NULL AND planned_end IS NULL)",
    )
    op.create_check_constraint(
        "planned_needs_start",
        "plans",
        "status <> 'PLANNED' OR "
        "((planned_on IS NOT NULL AND planned_start IS NULL) OR "
        "(planned_on IS NULL AND planned_start IS NOT NULL))",
    )
    op.create_index(
        "ix_plans_space_id_planned_on",
        "plans",
        ["space_id", "planned_on"],
    )


def downgrade() -> None:
    # The pre-#838 schema cannot represent a real date-only Plan. Refuse a
    # lossy downgrade instead of fabricating a midnight/noon timestamp.
    connection = op.get_bind()
    has_date_only = connection.execute(
        sa.text("SELECT 1 FROM plans WHERE planned_on IS NOT NULL LIMIT 1")
    ).first()
    if has_date_only is not None:
        raise RuntimeError(
            "Cannot downgrade 0051 while date-only Plan schedules exist; "
            "the previous schema has no lossless representation for them."
        )

    op.drop_index("ix_plans_space_id_planned_on", table_name="plans")
    op.drop_constraint("planned_needs_start", "plans", type_="check")
    op.drop_constraint("idea_has_no_schedule", "plans", type_="check")
    op.drop_constraint("schedule_has_single_start", "plans", type_="check")

    op.create_check_constraint(
        "idea_has_no_schedule",
        "plans",
        "status <> 'IDEA' OR (planned_start IS NULL AND planned_end IS NULL)",
    )
    op.create_check_constraint(
        "planned_needs_start",
        "plans",
        "status <> 'PLANNED' OR planned_start IS NOT NULL",
    )

    op.drop_column("plans", "planned_on")
