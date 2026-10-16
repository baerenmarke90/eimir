"""ServerAdmin Account action audit history.

Revision ID: 0037
Revises: 0036
Create Date: 2026-09-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0037"
down_revision = "0036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instance_administration_action_events",
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("target_account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("effect_count", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "action IN ("
            "'account_suspended', "
            "'account_unsuspended', "
            "'account_sessions_revoked', "
            "'account_email_verified', "
            "'account_recovery_email_requested', "
            "'account_recovery_issued'"
            ")",
            name="action_valid",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["target_account_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_instance_administration_action_events_created_at",
        "instance_administration_action_events",
        ["created_at"],
        unique=False,
    )
    op.create_index(
        "ix_instance_administration_action_events_target",
        "instance_administration_action_events",
        ["target_account_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_instance_administration_action_events_target",
        table_name="instance_administration_action_events",
    )
    op.drop_index(
        "ix_instance_administration_action_events_created_at",
        table_name="instance_administration_action_events",
    )
    op.drop_table("instance_administration_action_events")
