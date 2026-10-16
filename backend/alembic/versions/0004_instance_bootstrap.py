"""atomic instance bootstrap

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "instance_bootstrap_state",
        sa.Column("singleton_key", sa.SmallInteger(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_by", UUID, nullable=True),
        sa.CheckConstraint("singleton_key = 1", name="singleton_key_is_one"),
        sa.ForeignKeyConstraint(
            ["completed_by"],
            ["accounts.id"],
            name="fk_instance_bootstrap_state_completed_by_accounts",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("singleton_key", name="pk_instance_bootstrap_state"),
    )

    # Existing installations are already operational and must not receive new
    # bootstrap access as a result of the upgrade.
    op.execute(
        sa.text(
            """
            INSERT INTO instance_bootstrap_state
                (singleton_key, created_at, completed_at)
            SELECT 1, CURRENT_TIMESTAMP,
                   CASE WHEN EXISTS (SELECT 1 FROM accounts)
                        THEN CURRENT_TIMESTAMP ELSE NULL END
            """
        )
    )


def downgrade() -> None:
    op.drop_table("instance_bootstrap_state")
