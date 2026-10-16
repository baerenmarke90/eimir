"""M4-B Activity and in-app Notification projections.

Revision ID: 0029
Revises: 0028
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0029"
down_revision = "0028"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

ACTIVITY_KINDS = (
    "MEMORY_CREATED",
    "MILESTONE_CREATED",
    "HEART_MOMENT_CREATED",
    "WISH_CREATED",
    "PLAN_CREATED",
    "PLAN_COMPLETED",
    "PLACE_CREATED",
    "CHAPTER_CREATED",
    "COLLECTION_CREATED",
    "COMMENT_CREATED",
)
NOTIFICATION_KINDS = ("COMMENT_CREATED",)
TARGET_TYPES = (
    "MEMORY",
    "HEART_MOMENT",
    "MILESTONE",
    "WISH",
    "PLAN",
    "PLACE",
    "CHAPTER",
    "COLLECTION",
)


def _quoted(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{value}'" for value in values)


def upgrade() -> None:
    op.create_table(
        "activities",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("source_event_id", UUID, nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("actor_id", UUID, nullable=True),
        sa.Column("target_type", sa.String(length=32), nullable=True),
        sa.Column("target_id", UUID, nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activities"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_activities_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["accounts.id"],
            name="fk_activities_actor_id_accounts",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "source_event_id",
            "kind",
            name="uq_activities_source_event_kind",
        ),
        sa.CheckConstraint(
            f"kind IN ({_quoted(ACTIVITY_KINDS)})",
            name="activity_kind_allowed",
        ),
        sa.CheckConstraint(
            f"target_type IS NULL OR target_type IN ({_quoted(TARGET_TYPES)})",
            name="activity_target_type_allowed",
        ),
        sa.CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="activity_target_reference_complete",
        ),
    )
    op.create_index(
        "ix_activities_space_occurred_id",
        "activities",
        ["space_id", "occurred_at", "id"],
    )

    op.create_table(
        "notifications",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("recipient_account_id", UUID, nullable=False),
        sa.Column("source_event_id", UUID, nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("actor_id", UUID, nullable=True),
        sa.Column("target_type", sa.String(length=32), nullable=True),
        sa.Column("target_id", UUID, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_notifications_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_notifications_recipient_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["accounts.id"],
            name="fk_notifications_actor_id_accounts",
            ondelete="SET NULL",
        ),
        sa.UniqueConstraint(
            "recipient_account_id",
            "source_event_id",
            "kind",
            name="uq_notifications_recipient_source_kind",
        ),
        sa.CheckConstraint(
            f"kind IN ({_quoted(NOTIFICATION_KINDS)})",
            name="notification_kind_allowed",
        ),
        sa.CheckConstraint(
            f"target_type IS NULL OR target_type IN ({_quoted(TARGET_TYPES)})",
            name="notification_target_type_allowed",
        ),
        sa.CheckConstraint(
            "(target_type IS NULL) = (target_id IS NULL)",
            name="notification_target_reference_complete",
        ),
    )
    op.create_index(
        "ix_notifications_recipient_space_created_id",
        "notifications",
        ["recipient_account_id", "space_id", "created_at", "id"],
    )
    op.create_index(
        "ix_notifications_recipient_space_unread",
        "notifications",
        ["recipient_account_id", "space_id", "created_at"],
        postgresql_where=sa.text("read_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_notifications_recipient_space_unread",
        table_name="notifications",
    )
    op.drop_index(
        "ix_notifications_recipient_space_created_id",
        table_name="notifications",
    )
    op.drop_table("notifications")

    op.drop_index("ix_activities_space_occurred_id", table_name="activities")
    op.drop_table("activities")
