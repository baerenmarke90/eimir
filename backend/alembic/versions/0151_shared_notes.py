"""Add shared notes and the Plan-note relation (#1969).

Revision ID: 0151
Revises: 0149
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0151"
down_revision = "0149"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


_KINDS = (
    "'ONCE_MESSAGE_RECEIVED', 'GENTLE_PROMPT', 'REMINDER_CREATED', 'TRANSFER_READY', "
    "'TRANSFER_COMPLETED', 'TRANSFER_FAILED', 'VIDEO_PROCESSING_FAILED', "
    "'PLAN_CREATED', 'PLAN_CHANGED', 'PLAN_CANCELLED', 'WISH_SELECTION_SHARED', "
    "'WISH_SELECTION_READY', 'WISH_SELECTION_RANDOM_REQUESTED', "
    "'WISH_SELECTION_RANDOM_ACCEPTED', 'WISH_SELECTION_RANDOM_DECLINED', "
    "'PHOTO_REACTION', 'PARTNER_JOINED', 'COUPLE_EXPERIENCE_SHARED', "
    "'COMMENT_CREATED', 'THINKING_OF_YOU', 'PARTNER_KISS', 'PARTNER_CHECK_IN', 'REMINDER_DUE', "
    "'WISH_REMINDER_DUE', 'WISH_DATE_PROPOSED', 'WISH_DATE_COUNTERED', 'WISH_DATE_ACCEPTED', "
    "'COLLECTION_SENT', 'HEART_HUNT_HIDDEN', 'HEART_HUNT_FOUND', 'PICTURE_PING_PONG_TURN'"
)
_NEW_KINDS = "'SHARED_NOTE_CREATED', 'SHARED_NOTE_CHANGED'"
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION', "
    "'PICTURE_GAME'"
)
_COALESCED = (
    "'PHOTO_REACTION', 'WISH_SELECTION_SHARED', 'WISH_SELECTION_READY', "
    "'WISH_SELECTION_RANDOM_REQUESTED', 'WISH_SELECTION_RANDOM_ACCEPTED', "
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT', 'PICTURE_PING_PONG_TURN'"
)


def _catalog(new: bool) -> None:
    """Add (or remove) the shared-note notification kinds, target and coalescing."""
    kinds = _KINDS + (f", {_NEW_KINDS}" if new else "")
    targets = _TARGETS + (", 'SHARED_NOTE'" if new else "")
    coalesced = _COALESCED + (", 'SHARED_NOTE_CHANGED'" if new else "")
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
    _catalog(True)
    op.create_table(
        "shared_notes",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column(
            "crypto_version",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("pinned", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("wir_title_only", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "edited_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("edited_by", UUID, nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_shared_notes"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_shared_notes_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_shared_notes_owner_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["edited_by"],
            ["accounts.id"],
            name="fk_shared_notes_edited_by_accounts",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint("privacy_class = 'SPACE_SHARED'", name="privacy_is_space_shared"),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
        sa.UniqueConstraint("id", "space_id", name="uq_shared_notes_id_space_id"),
    )
    op.create_index("ix_shared_notes_space_id", "shared_notes", ["space_id"])
    op.create_index("ix_shared_notes_owner_id", "shared_notes", ["owner_id"])
    op.create_index("ix_shared_notes_edited_by", "shared_notes", ["edited_by"])
    op.create_index(
        "ix_shared_notes_space_id_edited_at_id",
        "shared_notes",
        ["space_id", "edited_at", "id"],
    )

    op.create_table(
        "plan_notes",
        sa.Column("plan_id", UUID, primary_key=True),
        sa.Column("note_id", UUID, primary_key=True),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column(
            "created_by",
            UUID,
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.ForeignKeyConstraint(
            ["plan_id", "space_id"], ["plans.id", "plans.space_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["note_id", "space_id"],
            ["shared_notes.id", "shared_notes.space_id"],
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_plan_notes_note_id", "plan_notes", ["note_id"])
    op.create_index("ix_plan_notes_space_id", "plan_notes", ["space_id"])


def downgrade() -> None:
    op.drop_table("plan_notes")
    op.drop_table("shared_notes")
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW_KINDS})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW_KINDS})")
    op.execute("DELETE FROM notifications WHERE target_type = 'SHARED_NOTE'")
    op.execute("DELETE FROM activities WHERE target_type = 'SHARED_NOTE'")
    op.execute(
        "DELETE FROM outbox_events WHERE event_type IN "
        "('SHARED_NOTE_CREATED', 'SHARED_NOTE_UPDATED', 'SHARED_NOTE_PRESENTATION_CHANGED', "
        "'SHARED_NOTE_DELETED', 'PLAN_NOTE_LINKED', 'PLAN_NOTE_UNLINKED')"
    )
    _catalog(False)
