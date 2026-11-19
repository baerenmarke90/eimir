"""Recap readiness notices and late-entry tracking (#1744).

Each composed recap edition records a fingerprint of the shared material it
accounted for (``material_digest``, with the database time of that composition
in ``material_at``). The background scan compares it with the current material
of the period and remembers a pending change (``observed_digest`` and
``observed_at``) until the period has been quiet. A retained edition may get a
newer version that points back to it (``supersedes_id``). ``announcement`` and
``announced_at`` record the one readiness notice a retained edition earns.

Two notification kinds (``RECAP_READY`` and ``RECAP_GREW``) and one target type
(``RECAP``) join the catalog. Neither coalesces: every notice is guarded by the
edition's ``announced_at``.

Revision ID: 0159
Revises: 0158
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0159"
down_revision = "0158"
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
    "'GARDEN_SEED_ARRIVED'"
)
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION', "
    "'PICTURE_GAME', 'SHARED_NOTE', 'GARDEN_SEED', 'GARDEN_BOUQUET'"
)
_NEW_KINDS = "'RECAP_READY', 'RECAP_GREW'"
_NEW_TARGET = "'RECAP'"
_NEW_EVENTS = "'RECAP_READY', 'RECAP_GREW', 'RECAPS_COLLECTED'"


def _catalog(include_recaps: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KINDS}" if include_recaps else "")
    targets = _TARGETS + (f", {_NEW_TARGET}" if include_recaps else "")
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
    op.add_column("recap_editions", sa.Column("material_digest", sa.String(32), nullable=True))
    op.add_column(
        "recap_editions", sa.Column("material_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("recap_editions", sa.Column("observed_digest", sa.String(32), nullable=True))
    op.add_column(
        "recap_editions", sa.Column("observed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("recap_editions", sa.Column("announcement", sa.String(8), nullable=True))
    op.add_column(
        "recap_editions", sa.Column("announced_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "recap_editions",
        sa.Column(
            "supersedes_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "recap_editions.id",
                ondelete="SET NULL",
                name=op.f("fk_recap_editions_supersedes_id_recap_editions"),
            ),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "announcement_is_known",
        "recap_editions",
        "announcement IS NULL OR announcement IN ('READY', 'GREW', 'EARLIER')",
    )
    op.create_index(
        "ix_recap_editions_unannounced",
        "recap_editions",
        ["space_id"],
        postgresql_where=sa.text("announcement IS NOT NULL AND announced_at IS NULL"),
    )
    op.create_index("ix_recap_editions_supersedes", "recap_editions", ["supersedes_id"])
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW_KINDS})")
    op.execute(f"DELETE FROM notifications WHERE target_type = {_NEW_TARGET}")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW_KINDS})")
    op.execute(f"DELETE FROM outbox_events WHERE event_type IN ({_NEW_EVENTS})")
    _catalog(False)
    op.drop_index("ix_recap_editions_supersedes", table_name="recap_editions")
    op.drop_index("ix_recap_editions_unannounced", table_name="recap_editions")
    op.drop_constraint(
        op.f("ck_recap_editions_announcement_is_known"), "recap_editions", type_="check"
    )
    for column in (
        "supersedes_id",
        "announced_at",
        "announcement",
        "observed_at",
        "observed_digest",
        "material_at",
        "material_digest",
    ):
        op.drop_column("recap_editions", column)
