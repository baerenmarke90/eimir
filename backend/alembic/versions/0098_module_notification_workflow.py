"""Classify intentional module notifications and bound transient reminders.

Revision ID: 0098
Revises: 0097
"""

import sqlalchemy as sa
from alembic import op

revision = "0098"
down_revision = "0097"
branch_labels = None
depends_on = None

_OLD = (
    "'COUPLE_EXPERIENCE_SHARED', 'COMMENT_CREATED', 'THINKING_OF_YOU', "
    "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE'"
)
_NEW = (
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', "
    "'TRANSFER_READY', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED'"
)
_TARGETS = "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION'"
_COALESCED = "kind IN ('PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY')"


def _catalog(kinds: str, targets: str) -> None:
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")
    for table, name in (
        ("notifications", "notification_target_type_allowed"),
        ("activities", "activity_target_type_allowed"),
    ):
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(
            name, table, f"target_type IS NULL OR target_type IN ({targets})"
        )


def upgrade() -> None:
    op.add_column("notifications", sa.Column("expires_at", sa.DateTime(timezone=True)))
    _catalog(
        f"{_OLD}, {_NEW}", f"{_TARGETS}, 'WISH_SELECTION', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT'"
    )
    op.create_index(
        "uq_notifications_coalesced_target",
        "notifications",
        ["recipient_account_id", "space_id", "kind", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text(_COALESCED),
    )


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW})")
    op.drop_index("uq_notifications_coalesced_target", table_name="notifications")
    _catalog(_OLD, _TARGETS)
    op.drop_column("notifications", "expires_at")
