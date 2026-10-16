"""Instance administration settings and audit history.

Revision ID: 0036
Revises: 0035
Create Date: 2026-09-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "instance_administration_settings",
        sa.Column("singleton_key", sa.SmallInteger(), nullable=False),
        sa.Column("registration_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.CheckConstraint(
            "singleton_key = 1",
            name="singleton_key_is_one",
        ),
        sa.PrimaryKeyConstraint("singleton_key"),
    )
    op.execute(
        sa.text(
            "INSERT INTO instance_administration_settings "
            "(singleton_key, registration_enabled, maintenance_mode, version) "
            "VALUES (1, true, false, 1)"
        )
    )

    op.create_table(
        "instance_administration_events",
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("setting", sa.String(length=64), nullable=False),
        sa.Column("previous_value", sa.Boolean(), nullable=False),
        sa.Column("new_value", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.CheckConstraint(
            "setting IN ('registration_enabled', 'maintenance_mode')",
            name="setting_valid",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["accounts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_instance_administration_events_created_at",
        "instance_administration_events",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_instance_administration_events_created_at",
        table_name="instance_administration_events",
    )
    op.drop_table("instance_administration_events")
    op.drop_table("instance_administration_settings")
