"""Calendar sync connections, shared Space targets and Plan event links (#1895).

Revision ID: 0134
Revises: 0133
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0134"
down_revision = "0133"
branch_labels = None
depends_on = None


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "calendar_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint("provider IN ('CALDAV', 'GOOGLE')", name="provider_is_known"),
        sa.CheckConstraint("status IN ('ACTIVE', 'BROKEN')", name="status_is_known"),
    )
    op.create_index("ix_calendar_connections_account_id", "calendar_connections", ["account_id"])
    op.create_table(
        "space_calendar_targets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "connection_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("calendar_connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "sponsor_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("status_reason", sa.String(48)),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'PAUSED', 'SUSPENDED')", name="target_status_is_known"
        ),
    )
    op.create_index(
        "ix_space_calendar_targets_connection_id", "space_calendar_targets", ["connection_id"]
    )
    op.create_table(
        "plan_calendar_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("space_calendar_targets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("reason", sa.String(48)),
        sa.Column("synced_plan_version", sa.Integer()),
        sa.Column("synced_at", sa.DateTime(timezone=True)),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        *_timestamps(),
        sa.UniqueConstraint("target_id", "plan_id", name="uq_plan_calendar_links_target_plan"),
        sa.CheckConstraint(
            "state IN ('PENDING', 'SYNCED', 'CONFLICT', 'KEPT', 'DETACHED', 'FAILED')",
            name="link_state_is_known",
        ),
    )
    op.create_index(
        "ix_plan_calendar_links_space_plan", "plan_calendar_links", ["space_id", "plan_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_plan_calendar_links_space_plan", table_name="plan_calendar_links")
    op.drop_table("plan_calendar_links")
    op.drop_index("ix_space_calendar_targets_connection_id", table_name="space_calendar_targets")
    op.drop_table("space_calendar_targets")
    op.drop_index("ix_calendar_connections_account_id", table_name="calendar_connections")
    op.drop_table("calendar_connections")
