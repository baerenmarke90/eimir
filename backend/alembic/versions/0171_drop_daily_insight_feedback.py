"""Delete the retained weekly recommendation ratings and drop their table (#2210).

The weekly AI review that collected these caller-private ratings was retired
(#2203), and the Einblicke feature that offered deleting them was removed and
deferred (#2210). Their purpose has ended, so the rows are deleted with the
table. A downgrade recreates the empty table; deleted ratings do not return.

Revision ID: 0171
Revises: 0170
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0171"
down_revision = "0170"
branch_labels = None
depends_on = None

TABLE = "daily_insight_feedback"


def upgrade() -> None:
    op.drop_table(TABLE)


def downgrade() -> None:
    op.create_table(
        TABLE,
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("recommendation_key", sa.String(32), nullable=False),
        sa.Column("rating", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.UniqueConstraint(
            "space_id",
            "account_id",
            "recommendation_key",
            name="uq_daily_insight_feedback_owner_key",
        ),
        sa.CheckConstraint(
            "recommendation_key IN ('quiet_time','small_plan','appreciation',"
            "'listening','own_pace','keep_ritual')",
            name="recommendation_is_known",
        ),
        sa.CheckConstraint("rating IN ('HELPFUL','NOT_FITTING')", name="rating_is_known"),
    )
