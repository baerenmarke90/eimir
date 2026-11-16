"""Store personal one-time Wish reminders and admit their derived notices.

Revision ID: 0126
Revises: 0125
"""

import sqlalchemy as sa
from alembic import op

revision = "0126"
down_revision = "0125"
branch_labels = None
depends_on = None

_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE'"
)


def _catalog(include_wish_reminders: bool) -> None:
    kinds = _KINDS + (", 'WISH_REMINDER_DUE'" if include_wish_reminders else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    op.create_table(
        "wish_reminders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("space_id", sa.Uuid(), nullable=False),
        sa.Column("wish_id", sa.Uuid(), nullable=False),
        sa.Column(
            "account_id",
            sa.Uuid(),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fired_at", sa.DateTime(timezone=True)),
        sa.ForeignKeyConstraint(
            ["wish_id", "space_id"], ["wishes.id", "wishes.space_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint("wish_id", "account_id", name="uq_wish_reminders_wish_account"),
    )
    op.create_index("ix_wish_reminders_account_space", "wish_reminders", ["account_id", "space_id"])
    _catalog(True)


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE kind = 'WISH_REMINDER_DUE'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'WISH_REMINDER_DUE'")
    op.execute("DELETE FROM outbox_events WHERE event_type = 'WISH_REMINDER_DUE'")
    op.execute("DELETE FROM jobs WHERE kind = 'wish-reminder'")
    _catalog(False)
    op.drop_table("wish_reminders")
