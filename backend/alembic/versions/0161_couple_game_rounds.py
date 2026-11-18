"""Add remote rounds for the couple games and their shared turn notice.

Who of us, Wish detective and Our moments can be played at a distance, each
partner on their own device. One row per Space and game type keeps the current
or last game; answers, clues, guesses and the memory board live in a protected
payload. One notification kind (``COUPLE_GAME_TURN``) and three target types
(``WHO_OF_US_GAME``, ``WISH_DETECTIVE_GAME``, ``OUR_MOMENTS_GAME``) join the
catalog; the notice coalesces per recipient and game like the picture turn.
``PICTURE_PING_PONG_FINISHED`` (target ``PICTURE_GAME``) tells the partner that
the shared picture was completed; it coalesces the same way.

Revision ID: 0161
Revises: 0160
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0161"
down_revision = "0160"
branch_labels = None
depends_on = None

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
    "'GARDEN_SEED_ARRIVED', 'RECAP_READY', 'RECAP_GREW'"
)
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION', "
    "'PICTURE_GAME', 'SHARED_NOTE', 'GARDEN_SEED', 'GARDEN_BOUQUET', 'RECAP'"
)
_COALESCED = (
    "'PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT', 'PICTURE_PING_PONG_TURN', "
    "'SHARED_NOTE_CHANGED', 'GARDEN_SEED_ARRIVED'"
)
_NEW_KIND = "'COUPLE_GAME_TURN', 'PICTURE_PING_PONG_FINISHED'"
_NEW_TARGETS = "'WHO_OF_US_GAME', 'WISH_DETECTIVE_GAME', 'OUR_MOMENTS_GAME'"


def _catalog(include_games: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KIND}" if include_games else "")
    targets = _TARGETS + (f", {_NEW_TARGETS}" if include_games else "")
    coalesced = _COALESCED + (f", {_NEW_KIND}" if include_games else "")
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
        "couple_games",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("game", sa.String(16), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("started_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("ended_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("waiting_on_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("space_id", "game", name=op.f("uq_couple_games_space_game")),
        sa.CheckConstraint(
            "game IN ('WHO_OF_US', 'WISH_DETECTIVE', 'OUR_MOMENTS')",
            name=op.f("ck_couple_games_game_allowed"),
        ),
        sa.CheckConstraint(
            "status IN ('OPEN', 'FINISHED', 'ENDED')",
            name=op.f("ck_couple_games_status_allowed"),
        ),
        sa.CheckConstraint(
            "status <> 'ENDED' OR waiting_on_id IS NULL",
            name=op.f("ck_couple_games_nobody_waited_on_once_ended"),
        ),
        sa.CheckConstraint(
            "(status = 'ENDED') = (ended_by IS NOT NULL)",
            name=op.f("ck_couple_games_ended_by_matches_status"),
        ),
        sa.CheckConstraint(
            "crypto_version >= 0",
            name=op.f("ck_couple_games_crypto_version_is_non_negative"),
        ),
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW_KIND})")
    op.execute(f"DELETE FROM notifications WHERE target_type IN ({_NEW_TARGETS})")
    op.execute(f"DELETE FROM activities WHERE target_type IN ({_NEW_TARGETS})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW_KIND})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_NEW_KIND})")
    _catalog(False)
    op.drop_table("couple_games")
