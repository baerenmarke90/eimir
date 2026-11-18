"""Track which event revisions already include a link back to their Plan.

Revision ID: 0141
Revises: 0140
"""

import sqlalchemy as sa
from alembic import op

revision = "0141"
down_revision = "0140"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan_calendar_links", sa.Column("backlink_plan_version", sa.Integer()))


def downgrade() -> None:
    op.drop_column("plan_calendar_links", "backlink_plan_version")
