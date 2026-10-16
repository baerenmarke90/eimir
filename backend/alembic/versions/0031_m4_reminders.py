"""M4-C Reminder definitions, offsets and recipient preferences.

Revision ID: 0031
Revises: 0030
Create Date: 2026-08-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0031"
down_revision = "0030"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def _reminder_source() -> sa.Enum:
    return sa.Enum(
        "MANUAL",
        "GENERATED",
        name="reminder_source",
        native_enum=False,
        create_constraint=True,
    )


def _reminder_schedule_type() -> sa.Enum:
    return sa.Enum(
        "ONCE",
        "ANNUAL",
        "RELATIONSHIP_DAY_COUNT",
        name="reminder_schedule_type",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "reminders",
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
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column(
            "source",
            _reminder_source(),
            server_default=sa.text("'MANUAL'"),
            nullable=False,
        ),
        sa.Column("source_type", sa.String(length=64), nullable=True),
        sa.Column("source_id", UUID, nullable=True),
        sa.Column("rule_key", sa.String(length=96), nullable=True),
        sa.Column("schedule_type", _reminder_schedule_type(), nullable=False),
        sa.Column("once_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("annual_month", sa.SmallInteger(), nullable=True),
        sa.Column("annual_day", sa.SmallInteger(), nullable=True),
        sa.Column("local_time", sa.Time(timezone=False), nullable=True),
        sa.Column("relationship_day_count", sa.Integer(), nullable=True),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_reminders"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_reminders_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_reminders_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "privacy_class = 'SPACE_SHARED'",
            name="reminder_privacy_is_shared",
        ),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name="reminder_crypto_version_non_negative",
        ),
        sa.CheckConstraint(
            "(source = 'MANUAL' AND source_type IS NULL AND source_id IS NULL "
            "AND rule_key IS NULL) "
            "OR (source = 'GENERATED' AND source_type IS NOT NULL AND source_id IS NOT NULL "
            "AND rule_key IS NOT NULL)",
            name="reminder_source_fields_valid",
        ),
        sa.CheckConstraint(
            "(schedule_type = 'ONCE' AND once_at IS NOT NULL AND annual_month IS NULL "
            "AND annual_day IS NULL AND local_time IS NULL AND relationship_day_count IS NULL) "
            "OR (schedule_type = 'ANNUAL' AND once_at IS NULL AND annual_month IS NOT NULL "
            "AND annual_day IS NOT NULL AND local_time IS NOT NULL "
            "AND relationship_day_count IS NULL) "
            "OR (schedule_type = 'RELATIONSHIP_DAY_COUNT' AND once_at IS NULL "
            "AND annual_month IS NULL AND annual_day IS NULL AND local_time IS NOT NULL "
            "AND relationship_day_count IS NOT NULL)",
            name="reminder_schedule_fields_valid",
        ),
        sa.CheckConstraint(
            "annual_month IS NULL OR annual_month BETWEEN 1 AND 12",
            name="reminder_annual_month_range",
        ),
        sa.CheckConstraint(
            "annual_day IS NULL OR annual_day BETWEEN 1 AND 31",
            name="reminder_annual_day_range",
        ),
        sa.CheckConstraint(
            "relationship_day_count IS NULL OR relationship_day_count >= 1",
            name="reminder_relationship_day_count_positive",
        ),
        sa.UniqueConstraint("id", "space_id", name="uq_reminders_id_space_id"),
        sa.UniqueConstraint(
            "space_id",
            "source_type",
            "source_id",
            "rule_key",
            name="uq_reminders_generated_identity",
        ),
    )
    op.create_index("ix_reminders_space_id", "reminders", ["space_id"])
    op.create_index(
        "ix_reminders_space_created_id",
        "reminders",
        ["space_id", "created_at", "id"],
    )
    op.create_index(
        "ix_reminders_space_source",
        "reminders",
        ["space_id", "source"],
    )

    op.create_table(
        "reminder_offsets",
        sa.Column("id", UUID, nullable=False),
        sa.Column("reminder_id", UUID, nullable=False),
        sa.Column("days_before", sa.SmallInteger(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_reminder_offsets"),
        sa.ForeignKeyConstraint(
            ["reminder_id"],
            ["reminders.id"],
            name="fk_reminder_offsets_reminder_id_reminders",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "days_before BETWEEN 0 AND 365",
            name="reminder_offset_days_before_range",
        ),
        sa.UniqueConstraint(
            "reminder_id",
            "days_before",
            name="uq_reminder_offsets_reminder_days",
        ),
    )
    op.create_index(
        "ix_reminder_offsets_reminder_days",
        "reminder_offsets",
        ["reminder_id", "days_before"],
    )

    op.create_table(
        "reminder_preferences",
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
        sa.Column("reminder_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("muted", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_reminder_preferences"),
        sa.ForeignKeyConstraint(
            ["reminder_id"],
            ["reminders.id"],
            name="fk_reminder_preferences_reminder_id_reminders",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_reminder_preferences_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "reminder_id",
            "account_id",
            name="uq_reminder_preferences_reminder_account",
        ),
    )
    op.create_index(
        "ix_reminder_preferences_account",
        "reminder_preferences",
        ["account_id", "reminder_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_reminder_preferences_account", table_name="reminder_preferences")
    op.drop_table("reminder_preferences")
    op.drop_index("ix_reminder_offsets_reminder_days", table_name="reminder_offsets")
    op.drop_table("reminder_offsets")
    op.drop_index("ix_reminders_space_source", table_name="reminders")
    op.drop_index("ix_reminders_space_created_id", table_name="reminders")
    op.drop_index("ix_reminders_space_id", table_name="reminders")
    op.drop_table("reminders")
