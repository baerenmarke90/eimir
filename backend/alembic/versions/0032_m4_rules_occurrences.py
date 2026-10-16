"""M4-C Rule preferences and durable Reminder occurrences.

Revision ID: 0032
Revises: 0031
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0032"
down_revision = "0031"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "rule_preferences",
        sa.Column("id", UUID, nullable=False),
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
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("rule_key", sa.String(length=96), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column(
            "parameters",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_rule_preferences"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_rule_preferences_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_rule_preferences_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "account_id",
            "space_id",
            "rule_key",
            name="uq_rule_preferences_account_space_rule",
        ),
    )
    op.create_index(
        "ix_rule_preferences_space_account",
        "rule_preferences",
        ["space_id", "account_id"],
    )

    op.create_table(
        "reminder_occurrences",
        sa.Column("id", UUID, nullable=False),
        sa.Column("reminder_id", UUID, nullable=False),
        sa.Column("recipient_account_id", UUID, nullable=False),
        sa.Column("occurrence_key", sa.String(length=128), nullable=False),
        sa.Column("days_before", sa.SmallInteger(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(length=16), nullable=False),
        sa.Column("generation", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_reminder_occurrences"),
        sa.ForeignKeyConstraint(
            ["reminder_id"],
            ["reminders.id"],
            name="fk_reminder_occurrences_reminder_id_reminders",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["recipient_account_id"],
            ["accounts.id"],
            name="fk_reminder_occurrences_recipient_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "days_before BETWEEN 0 AND 365",
            name="reminder_occurrence_days_before_range",
        ),
        sa.CheckConstraint(
            "state IN ('PENDING', 'DELIVERED', 'CANCELLED', 'SUPERSEDED', 'EXPIRED')",
            name="reminder_occurrence_state_allowed",
        ),
        sa.CheckConstraint(
            "generation >= 1",
            name="reminder_occurrence_generation_positive",
        ),
        sa.UniqueConstraint(
            "reminder_id",
            "recipient_account_id",
            "occurrence_key",
            "days_before",
            name="uq_reminder_occurrences_logical",
        ),
    )
    op.create_index(
        "ix_reminder_occurrences_recipient_state_due",
        "reminder_occurrences",
        ["recipient_account_id", "state", "due_at"],
    )
    op.create_index(
        "ix_reminder_occurrences_reminder_state_due",
        "reminder_occurrences",
        ["reminder_id", "state", "due_at"],
    )

    op.drop_constraint("notification_kind_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU', 'REMINDER_DUE')",
    )


def downgrade() -> None:
    op.drop_constraint("notification_kind_allowed", "notifications", type_="check")
    op.create_check_constraint(
        "notification_kind_allowed",
        "notifications",
        "kind IN ('COMMENT_CREATED', 'THINKING_OF_YOU')",
    )
    op.drop_index(
        "ix_reminder_occurrences_reminder_state_due",
        table_name="reminder_occurrences",
    )
    op.drop_index(
        "ix_reminder_occurrences_recipient_state_due",
        table_name="reminder_occurrences",
    )
    op.drop_table("reminder_occurrences")
    op.drop_index("ix_rule_preferences_space_account", table_name="rule_preferences")
    op.drop_table("rule_preferences")
