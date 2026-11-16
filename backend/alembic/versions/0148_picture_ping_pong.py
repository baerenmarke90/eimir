"""Add picture ping-pong state and its "your turn" notification.

#1907 H3 (concept B): one shared picture per Space, drawn in alternating turns.
The table keeps bounded stroke data (a protected payload) and turn state only.
One notification kind (`PICTURE_PING_PONG_TURN`) and one target type
(`PICTURE_GAME`) join the catalog; the notice coalesces per recipient and
picture like the other single-target notices.

Revision ID: 0148
Revises: 0147
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0148"
down_revision = "0147"
branch_labels = None
depends_on = None

_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'WISH_SELECTION_RANDOM_REQUESTED', "
    "'WISH_SELECTION_RANDOM_ACCEPTED', 'WISH_SELECTION_RANDOM_DECLINED', "
    "'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE', 'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED', "
    "'COLLECTION_SENT', 'HEART_HUNT_HIDDEN', 'HEART_HUNT_FOUND'"
)
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION'"
)
_COALESCED = (
    "'PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT'"
)
_NEW_KIND = "'PICTURE_PING_PONG_TURN'"
_NEW_TARGET = "'PICTURE_GAME'"


def _catalog(include_picture: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KIND}" if include_picture else "")
    targets = _TARGETS + (f", {_NEW_TARGET}" if include_picture else "")
    coalesced = _COALESCED + (f", {_NEW_KIND}" if include_picture else "")
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
    op.drop_index("uq_notifications_coalesced_target", table_name="notifications")
    op.create_index(
        "uq_notifications_coalesced_target",
        "notifications",
        ["recipient_account_id", "space_id", "kind", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text(f"kind IN ({coalesced})"),
    )


def upgrade() -> None:
    op.create_table(
        "picture_ping_pong",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("started_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("drawer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("turns_done", sa.SmallInteger(), nullable=False),
        sa.Column("finished_early", sa.Boolean(), nullable=False),
        sa.Column(
            "saved_memory_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("memories.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("space_id", name=op.f("uq_picture_ping_pong_space")),
        sa.CheckConstraint(
            "status IN ('DRAWING', 'FINISHED')", name=op.f("ck_picture_ping_pong_status_allowed")
        ),
        sa.CheckConstraint(
            "turns_done BETWEEN 0 AND 6", name=op.f("ck_picture_ping_pong_turns_bounded")
        ),
        sa.CheckConstraint(
            "(status = 'DRAWING' AND drawer_id IS NOT NULL)"
            " OR (status = 'FINISHED' AND drawer_id IS NULL)",
            name=op.f("ck_picture_ping_pong_drawer_matches_status"),
        ),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name=op.f("ck_picture_ping_pong_crypto_version_is_non_negative"),
        ),
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM notification_preferences WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM outbox_events WHERE event_type = {_NEW_KIND}")
    _catalog(False)
    op.drop_table("picture_ping_pong")
