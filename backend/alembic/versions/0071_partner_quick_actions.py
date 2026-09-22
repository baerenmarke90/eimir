"""Add extended partner support gesture receipts and notification kinds.

Revision ID: 0071
Revises: 0070
Create Date: 2026-09-22
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0071"
down_revision = "0070"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "support_gesture_requests",
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("sender_account_id", UUID, nullable=False),
        sa.Column("recipient_account_id", UUID, nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("client_request_id", UUID, nullable=False),
        sa.Column("source_event_id", UUID, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("id", UUID, nullable=False),
        sa.CheckConstraint(
            "sender_account_id <> recipient_account_id",
            name="support_gesture_sender_ne_recipient",
        ),
        sa.CheckConstraint(
            "kind IN ('KISS', 'CHECK_IN')",
            name="support_gesture_kind_allowed",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["sender_account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_event_id",
            name="uq_support_gesture_requests_source_event_id",
        ),
        sa.UniqueConstraint(
            "space_id",
            "sender_account_id",
            "kind",
            "client_request_id",
            name="uq_support_gesture_requests_sender_space_kind_client",
        ),
    )
    op.create_index(
        "ix_support_gesture_requests_sender_space_kind_created",
        "support_gesture_requests",
        ["sender_account_id", "space_id", "kind", "created_at"],
        unique=False,
    )

    op.drop_constraint(
        "notification_kind_allowed",
        "notifications",
        type_="check",
    )
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU', "
        "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE')",
    )


def downgrade() -> None:
    op.execute(
        sa.text("DELETE FROM notifications WHERE kind IN ('PARTNER_KISS', 'PARTNER_CHECK_IN')")
    )
    op.drop_constraint(
        "notification_kind_allowed",
        "notifications",
        type_="check",
    )
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU', 'REMINDER_DUE')",
    )
    op.drop_index(
        "ix_support_gesture_requests_sender_space_kind_created",
        table_name="support_gesture_requests",
    )
    op.drop_table("support_gesture_requests")
