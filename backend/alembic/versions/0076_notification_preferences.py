"""Add private account-owned notification channel overrides.

Revision ID: 0076
Revises: 0075
Create Date: 2026-09-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0076"
down_revision = "0075"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "notification_preferences",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_notification_preferences"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_notification_preferences_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', "
            "'PARTNER_CHECK_IN', 'REMINDER_DUE')",
            name="notif_pref_kind_allowed",
        ),
        sa.CheckConstraint(
            "channel IN ('IN_APP', 'PUSH', 'EMAIL')",
            name="notif_pref_channel_allowed",
        ),
        sa.UniqueConstraint(
            "account_id",
            "kind",
            "channel",
            name="uq_notification_preferences_account_kind_channel",
        ),
    )


def downgrade() -> None:
    op.drop_table("notification_preferences")
