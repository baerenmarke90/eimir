"""Admit authorized Wish date proposal notices.

Revision ID: 0139
Revises: 0138
"""

from alembic import op

revision = "0139"
down_revision = "0138"
branch_labels = None
depends_on = None

_EXISTING_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE'"
)
_PROPOSAL_KINDS = "'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED'"


def _catalog(include_proposals: bool) -> None:
    kinds = _EXISTING_KINDS + (f", {_PROPOSAL_KINDS}" if include_proposals else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_PROPOSAL_KINDS})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_PROPOSAL_KINDS})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_PROPOSAL_KINDS})")
    _catalog(False)
