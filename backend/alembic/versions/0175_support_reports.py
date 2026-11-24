"""Support reports and their single operator reply (#2189).

A signed-in person can send a problem report or feedback. A report belongs to
the reporter's Account, not to a Space, and keeps its allow-listed content in a
protected payload. The operator's reply lives in its own table with its own
protected payload, because the encryption tooling handles one protected
``payload`` column per table; the unique ``report_id`` allows one reply per
report, and the reply is deleted with its report.

One notification kind (``SUPPORT_REPLY``) and one target type
(``SUPPORT_REPORT``) join the catalog. The notice does not coalesce: one reply
creates one notice.

Revision ID: 0175
Revises: 0174
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0175"
down_revision = "0174"
branch_labels = None
depends_on = None

# The catalog as of 0162, the last revision that changed it; it equals the
# current NotificationKind and EngagementTarget members before this revision.
_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE', 'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT', 'HEART_HUNT_HIDDEN', 'HEART_HUNT_FOUND', "
    "'PICTURE_PING_PONG_TURN', 'SHARED_NOTE_CREATED', 'SHARED_NOTE_CHANGED', "
    "'GARDEN_SEED_ARRIVED', 'RECAP_READY', 'RECAP_GREW', "
    "'COUPLE_GAME_TURN', 'PICTURE_PING_PONG_FINISHED'"
)
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION', "
    "'PICTURE_GAME', 'SHARED_NOTE', 'GARDEN_SEED', 'GARDEN_BOUQUET', 'RECAP', "
    "'WHO_OF_US_GAME', 'WISH_DETECTIVE_GAME', 'OUR_MOMENTS_GAME'"
)
_NEW_KIND = "'SUPPORT_REPLY'"
_NEW_TARGET = "'SUPPORT_REPORT'"
_NEW_EVENT = "'SUPPORT_REPLY'"


def _catalog(include_support: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KIND}" if include_support else "")
    targets = _TARGETS + (f", {_NEW_TARGET}" if include_support else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")
    for table, name in (
        ("notifications", "notification_target_type_allowed"),
        ("activities", "activity_target_type_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(
            name, table, f"target_type IS NULL OR target_type IN ({targets})"
        )


def upgrade() -> None:
    op.create_table(
        "support_reports",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), server_default=sa.text("'NEW'"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(none_as_null=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_reports")),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
            name=op.f("fk_support_reports_account_id_accounts"),
        ),
        sa.UniqueConstraint(
            "account_id",
            "client_request_id",
            name=op.f("uq_support_reports_account_id_client_request_id"),
        ),
        sa.CheckConstraint(
            "kind IN ('PROBLEM', 'FEEDBACK')", name=op.f("ck_support_reports_kind_allowed")
        ),
        sa.CheckConstraint(
            "state IN ('NEW', 'IN_PROGRESS', 'CLOSED')",
            name=op.f("ck_support_reports_state_allowed"),
        ),
        sa.CheckConstraint(
            "(state = 'CLOSED') = (closed_at IS NOT NULL)",
            name=op.f("ck_support_reports_closed_at_matches_state"),
        ),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name=op.f("ck_support_reports_crypto_version_is_non_negative"),
        ),
    )
    op.create_index(
        "ix_support_reports_state_created_at_id",
        "support_reports",
        ["state", "created_at", "id"],
    )
    op.create_index("ix_support_reports_created_at", "support_reports", ["created_at"])
    op.create_table(
        "support_report_replies",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("report_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("replied_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(none_as_null=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_support_report_replies")),
        sa.ForeignKeyConstraint(
            ["report_id"],
            ["support_reports.id"],
            ondelete="CASCADE",
            name=op.f("fk_support_report_replies_report_id_support_reports"),
        ),
        sa.UniqueConstraint("report_id", name=op.f("uq_support_report_replies_report_id")),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name=op.f("ck_support_report_replies_crypto_version_is_non_negative"),
        ),
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW_KIND})")
    op.execute(f"DELETE FROM notifications WHERE target_type IN ({_NEW_TARGET})")
    op.execute(f"DELETE FROM activities WHERE target_type IN ({_NEW_TARGET})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW_KIND})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_NEW_EVENT})")
    _catalog(False)
    op.drop_table("support_report_replies")
    op.drop_index("ix_support_reports_created_at", table_name="support_reports")
    op.drop_index("ix_support_reports_state_created_at_id", table_name="support_reports")
    op.drop_table("support_reports")
