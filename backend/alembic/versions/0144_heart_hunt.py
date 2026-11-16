"""Add Herzversteck rounds and their two notice kinds (#1907 H3).

One row per hidden heart: the photo attachment, the normalized heart position,
the bounded search marks and the purge deadline. The photo is deleted on that
deadline by the retention job; the row goes with it. Two notice kinds join the
catalog (a heart was hidden, a heart was found); neither names a target row.

Revision ID: 0144
Revises: 0143
"""

import sqlalchemy as sa
from alembic import op

revision = "0144"
down_revision = "0143"
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
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT'"
)
_HEART_KINDS = "'HEART_HUNT_HIDDEN', 'HEART_HUNT_FOUND'"


def _catalog(include_heart: bool) -> None:
    kinds = _PREVIOUS_KINDS + (f", {_HEART_KINDS}" if include_heart else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def upgrade() -> None:
    op.create_table(
        "heart_hunt_rounds",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("space_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("hider_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("seeker_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("request_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attachment_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("heart_x", sa.SmallInteger(), nullable=False),
        sa.Column("heart_y", sa.SmallInteger(), nullable=False),
        sa.Column("state", sa.String(8), nullable=False),
        sa.Column(
            "taps",
            sa.dialects.postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("tap_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("best_level", sa.SmallInteger(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("found_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("purge_after", sa.DateTime(timezone=True), nullable=False),
        sa.Column("kept_memory_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["space_id"], ["spaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["hider_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seeker_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attachment_id"], ["attachments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["kept_memory_id"], ["memories.id"], ondelete="SET NULL"),
        sa.CheckConstraint("heart_x BETWEEN 0 AND 1000", name="heart_x_in_frame"),
        sa.CheckConstraint("heart_y BETWEEN 0 AND 1000", name="heart_y_in_frame"),
        sa.CheckConstraint("state IN ('HIDDEN', 'FOUND')", name="state_allowed"),
        sa.CheckConstraint("best_level BETWEEN 0 AND 3", name="best_level_allowed"),
        sa.CheckConstraint("hider_id <> seeker_id", name="hider_is_not_seeker"),
        sa.CheckConstraint("state = 'FOUND' OR found_at IS NULL", name="found_at_only_when_found"),
        sa.UniqueConstraint("attachment_id", name="uq_heart_hunt_rounds_attachment"),
        sa.UniqueConstraint(
            "space_id", "hider_id", "request_id", name="uq_heart_hunt_rounds_request"
        ),
    )
    op.create_index(
        "uq_heart_hunt_rounds_open_per_hider",
        "heart_hunt_rounds",
        ["space_id", "hider_id"],
        unique=True,
        postgresql_where=sa.text("state = 'HIDDEN'"),
    )
    op.create_index("ix_heart_hunt_rounds_purge_after", "heart_hunt_rounds", ["purge_after"])
    op.create_index(
        "ix_heart_hunt_rounds_space_created", "heart_hunt_rounds", ["space_id", "created_at"]
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_HEART_KINDS})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_HEART_KINDS})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_HEART_KINDS})")
    _catalog(False)
    op.drop_table("heart_hunt_rounds")
