"""Store the consent-based random pick and the decided candidate of a round.

#1907 J1: a partner may propose that chance decides; the other partner agrees,
declines or changes their favourites first. The server draws once on consent and
stores the decided candidate position on the round so both devices show the
same result. A manual choice among several common favourites uses the same
columns. Three notice kinds join the catalog and coalesce per round like the
existing wish-selection notices.

Revision ID: 0140
Revises: 0139
"""

import sqlalchemy as sa
from alembic import op

revision = "0140"
down_revision = "0139"
branch_labels = None
depends_on = None

TABLE = "wish_selection_rounds"
_EXISTING_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE', 'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED'"
)
_RANDOM_KINDS = (
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED'"
)
_COALESCED = "'PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY'"


def _catalog(include_random: bool) -> None:
    kinds = _EXISTING_KINDS + (f", {_RANDOM_KINDS}" if include_random else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")
    coalesced = _COALESCED + (f", {_RANDOM_KINDS}" if include_random else "")
    op.drop_index("uq_notifications_coalesced_target", table_name="notifications")
    op.create_index(
        "uq_notifications_coalesced_target",
        "notifications",
        ["recipient_account_id", "space_id", "kind", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text(f"kind IN ({coalesced})"),
    )


def upgrade() -> None:
    op.add_column(
        TABLE, sa.Column("random_requested_by", sa.dialects.postgresql.UUID(), nullable=True)
    )
    op.add_column(
        TABLE,
        sa.Column("random_declined", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(TABLE, sa.Column("decision_position", sa.SmallInteger(), nullable=True))
    op.add_column(TABLE, sa.Column("decision_method", sa.String(8), nullable=True))
    op.create_check_constraint(
        "random_decline_has_request",
        TABLE,
        "random_requested_by IS NOT NULL OR NOT random_declined",
    )
    op.create_check_constraint(
        "decision_is_complete",
        TABLE,
        "(decision_position IS NULL AND decision_method IS NULL)"
        " OR (decision_position BETWEEN 0 AND 4 AND decision_method IN ('RANDOM', 'MANUAL'))",
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_RANDOM_KINDS})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_RANDOM_KINDS})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_RANDOM_KINDS})")
    _catalog(False)
    op.drop_constraint(op.f(f"ck_{TABLE}_decision_is_complete"), TABLE, type_="check")
    op.drop_constraint(op.f(f"ck_{TABLE}_random_decline_has_request"), TABLE, type_="check")
    op.drop_column(TABLE, "decision_method")
    op.drop_column(TABLE, "decision_position")
    op.drop_column(TABLE, "random_declined")
    op.drop_column(TABLE, "random_requested_by")
