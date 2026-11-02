"""Add deliberate shared reminder creation and authorized reminder targets.

Revision ID: 0099
Revises: 0098
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0099"
down_revision = "0098"
branch_labels = None
depends_on = None

_KINDS = (
    "'COUPLE_EXPERIENCE_SHARED', 'COMMENT_CREATED', 'THINKING_OF_YOU', "
    "'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', 'PLAN_CREATED', "
    "'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY', "
    "'PHOTO_REACTION', 'PARTNER_JOINED', 'TRANSFER_READY', 'TRANSFER_COMPLETED', 'TRANSFER_FAILED'"
)
_TARGETS = (
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', "
    "'COLLECTION', 'WISH_SELECTION', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT'"
)


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
    op.create_table(
        "push_preview_secrets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "push_endpoint_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("push_endpoints.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column(
            "device_session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("device_sessions.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.CheckConstraint("crypto_version >= 0", name="preview_secret_crypto_valid"),
    )
    _catalog(f"{_KINDS}, 'REMINDER_CREATED'", f"{_TARGETS}, 'REMINDER'")


def downgrade() -> None:
    op.drop_table("push_preview_secrets")
    # Remove derived state only; preserve every authored reminder and due item.
    op.execute("DELETE FROM notifications WHERE kind = 'REMINDER_CREATED'")
    op.execute("DELETE FROM notification_preferences WHERE kind = 'REMINDER_CREATED'")
    op.execute(
        "UPDATE notifications SET target_type = NULL, target_id = NULL "
        "WHERE target_type = 'REMINDER'"
    )
    _catalog(_KINDS, _TARGETS)
