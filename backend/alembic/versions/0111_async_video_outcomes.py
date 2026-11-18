"""Retain failed placeholders and add uploader-only video outcomes.

Revision ID: 0111
Revises: 0110
"""

import sqlalchemy as sa
from alembic import op

revision = "0111"
down_revision = "0110"
branch_labels = None
depends_on = None

_OLD = (
    "'REMINDER_CREATED', 'TRANSFER_READY', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', "
    "'COUPLE_EXPERIENCE_SHARED', 'COMMENT_CREATED', 'THINKING_OF_YOU', "
    "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', 'GENTLE_PROMPT'"
)


def _catalog(kinds: str) -> None:
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    op.add_column("attachments", sa.Column("failed_media_purged_at", sa.DateTime(timezone=True)))
    _catalog(f"{_OLD}, 'VIDEO_PROCESSING_FAILED'")


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE kind = 'VIDEO_PROCESSING_FAILED'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'VIDEO_PROCESSING_FAILED'")
    _catalog(_OLD)
    op.drop_column("attachments", "failed_media_purged_at")
