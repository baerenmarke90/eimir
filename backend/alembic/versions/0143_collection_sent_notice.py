"""Add the notice for a list one partner deliberately sent to the other.

#1907 E2: "send this list to my partner" notifies the partner once per list. The
kind joins the closed notification catalog and coalesces per recipient and list
like the other single-target partner notices. No new table or column is needed:
adding the list to the partner's Wir uses the existing per-account selection.

Revision ID: 0143
Revises: 0142
"""

import sqlalchemy as sa
from alembic import op

revision = "0143"
down_revision = "0142"
branch_labels = None
depends_on = None

_PREVIOUS_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE', 'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED'"
)
_NEW_KIND = "'COLLECTION_SENT'"
_COALESCED = (
    "'PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED'"
)


def _catalog(include_sent: bool) -> None:
    kinds = _PREVIOUS_KINDS + (f", {_NEW_KIND}" if include_sent else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")
    coalesced = _COALESCED + (f", {_NEW_KIND}" if include_sent else "")
    op.drop_index("uq_notifications_coalesced_target", table_name="notifications")
    op.create_index(
        "uq_notifications_coalesced_target",
        "notifications",
        ["recipient_account_id", "space_id", "kind", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text(f"kind IN ({coalesced})"),
    )


def upgrade() -> None:
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM notification_preferences WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM outbox_events WHERE event_type = {_NEW_KIND}")
    _catalog(False)
