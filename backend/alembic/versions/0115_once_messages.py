"""Optional temporary partner messages and neutral notification kind.

Revision ID: 0115
Revises: 0114
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0115"
down_revision = "0114"
branch_labels = None
depends_on = None

_KINDS = (
    "'REMINDER_CREATED', 'TRANSFER_READY', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'PHOTO_REACTION', 'PARTNER_JOINED', "
    "'COUPLE_EXPERIENCE_SHARED', 'COMMENT_CREATED', 'THINKING_OF_YOU', "
    "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', 'GENTLE_PROMPT', "
    "'VIDEO_PROCESSING_FAILED'"
)
_TARGETS = (
    "'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', 'MEMORY', "
    "'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION'"
)


def _catalog(new: bool) -> None:
    kinds = _KINDS + (", 'ONCE_MESSAGE_RECEIVED'" if new else "")
    targets = _TARGETS + (", 'ONCE_MESSAGE'" if new else "")
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


def _ref(name: str, table: str, *, primary: bool = False) -> sa.Column:
    return sa.Column(
        name,
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey(f"{table}.id", ondelete="CASCADE"),
        primary_key=primary,
        nullable=False,
    )


def upgrade() -> None:
    op.create_table(
        "once_receptions",
        _ref("space_id", "spaces", primary=True),
        _ref("account_id", "accounts", primary=True),
        _ref("membership_id", "memberships"),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_table(
        "once_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _ref("space_id", "spaces"),
        _ref("account_id", "accounts"),
        _ref("membership_id", "memberships"),
        sa.Column("public_jwk", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_once_devices_space_id", "once_devices", ["space_id"])
    op.create_table(
        "once_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        _ref("space_id", "spaces"),
        _ref("sender_id", "accounts"),
        _ref("recipient_id", "accounts"),
        _ref("sender_membership_id", "memberships"),
        _ref("recipient_membership_id", "memberships"),
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("fingerprint", sa.String(64), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("claim_hash", sa.String(64)),
        sa.Column("claim_device_id", postgresql.UUID(as_uuid=True)),
        sa.Column("claim_until", sa.DateTime(timezone=True)),
        sa.CheckConstraint("sender_id <> recipient_id", name="once_distinct_partners"),
        sa.CheckConstraint("byte_size >= 0 AND byte_size <= 16777216", name="once_byte_bound"),
    )
    op.create_index(
        "uq_once_message_request",
        "once_messages",
        ["space_id", "sender_id", "request_id"],
        unique=True,
    )
    op.create_index("ix_once_inbox", "once_messages", ["space_id", "recipient_id", "expires_at"])
    op.create_index("ix_once_expiry", "once_messages", ["expires_at"])
    _catalog(True)


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE kind = 'ONCE_MESSAGE_RECEIVED'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'ONCE_MESSAGE_RECEIVED'")
    _catalog(False)
    op.drop_table("once_messages")
    op.drop_table("once_devices")
    op.drop_table("once_receptions")
