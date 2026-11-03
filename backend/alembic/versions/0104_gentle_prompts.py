"""Add explicit personal gentle-prompt consent and bounded private state.

Revision ID: 0104
Revises: 0103
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0104"
down_revision = "0103"
branch_labels = None
depends_on = None

_OLD = (
    "'REMINDER_CREATED', 'TRANSFER_READY', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', "
    "'COUPLE_EXPERIENCE_SHARED', 'COMMENT_CREATED', 'THINKING_OF_YOU', "
    "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE'"
)


def _catalog(kinds: str) -> None:
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column(
            "gentle_prompts_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
    )
    _catalog(f"{_OLD}, 'GENTLE_PROMPT'")
    op.create_table(
        "gentle_profiles",
        sa.Column(
            "account_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "space_id", pg.UUID(as_uuid=True), sa.ForeignKey("spaces.id", ondelete="SET NULL")
        ),
        sa.Column("observations", pg.JSONB(), nullable=False),
        sa.Column("last_use_at", sa.DateTime(timezone=True)),
        sa.Column("last_save_at", sa.DateTime(timezone=True)),
        sa.Column("interval_days", sa.Float()),
        sa.Column("windows", pg.JSONB(), nullable=False),
        sa.Column("attempts_since_use", sa.SmallInteger(), nullable=False),
        sa.Column("last_attempt_at", sa.DateTime(timezone=True)),
        sa.Column(
            "next_check_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(observations) = 'array' AND jsonb_array_length(observations) <= 8",
            name="gentle_observations_bounded",
        ),
        sa.CheckConstraint("attempts_since_use BETWEEN 0 AND 3", name="gentle_attempts_bounded"),
    )
    op.create_index(
        "ix_gentle_profiles_next_check", "gentle_profiles", ["next_check_at", "account_id"]
    )
    op.create_table(
        "gentle_occasions",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("occasion_key", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "memory_id", pg.UUID(as_uuid=True), sa.ForeignKey("memories.id", ondelete="SET NULL")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("baseline_use_at", sa.DateTime(timezone=True)),
        sa.Column("attempted_at", sa.DateTime(timezone=True)),
        sa.Column("dismissed_at", sa.DateTime(timezone=True)),
        sa.Column("opened_at", sa.DateTime(timezone=True)),
        sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("submission_token", pg.UUID(as_uuid=True)),
        sa.Column(
            "notification_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("notifications.id", ondelete="SET NULL"),
        ),
        sa.UniqueConstraint("account_id", "occasion_key", name="uq_gentle_account_occasion"),
        sa.CheckConstraint("kind IN ('WRITING', 'MEMORY')", name="gentle_occasion_kind"),
        sa.CheckConstraint("kind = 'MEMORY' OR memory_id IS NULL", name="gentle_source_kind"),
    )
    op.create_index(
        "ix_gentle_occasions_account_attempted", "gentle_occasions", ["account_id", "attempted_at"]
    )
    op.create_index("ix_gentle_occasions_created", "gentle_occasions", ["created_at", "id"])
    op.create_index(
        "ix_gentle_occasions_memory_created",
        "gentle_occasions",
        ["account_id", "memory_id", "created_at"],
    )
    op.create_table(
        "gentle_memory_exclusions",
        sa.Column(
            "account_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "memory_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("memories.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "space_id",
            pg.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("gentle_memory_exclusions")
    op.drop_table("gentle_occasions")
    op.drop_table("gentle_profiles")
    op.execute("DELETE FROM notifications WHERE kind = 'GENTLE_PROMPT'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'GENTLE_PROMPT'")
    _catalog(_OLD)
    op.drop_column("accounts", "gentle_prompts_enabled")
