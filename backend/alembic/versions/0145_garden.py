"""Add the shared garden and its "a seed arrived" notice.

#1907 H3 (concept A, core): partners send each other one seed per local day,
plant it and let the garden grow on days both took part. Two tables hold closed
codes, dates, stages and slots only (no location, no free text). One
notification kind (`GARDEN_SEED_ARRIVED`) and one target type (`GARDEN_SEED`)
join the closed catalog; the notice coalesces per recipient and seed.

Revision ID: 0145
Revises: 0144
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0145"
down_revision = "0144"
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
    "'WISH_SELECTION_RANDOM_DECLINED', 'COLLECTION_SENT', 'HEART_HUNT_HIDDEN', 'HEART_HUNT_FOUND'"
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
_NEW_KIND = "'GARDEN_SEED_ARRIVED'"
_NEW_TARGET = "'GARDEN_SEED'"


def _catalog(include_garden: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KIND}" if include_garden else "")
    targets = _TARGETS + (f", {_NEW_TARGET}" if include_garden else "")
    coalesced = _COALESCED + (f", {_NEW_KIND}" if include_garden else "")
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
        "garden_plants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sender_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("receiver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("species", sa.String(16), nullable=False),
        sa.Column("words", sa.String(24), nullable=True),
        sa.Column("sent_on", sa.Date(), nullable=False),
        sa.Column("planted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("slot", sa.SmallInteger(), nullable=True),
        sa.Column("stage", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "space_id", "sender_id", "sent_on", name=op.f("uq_garden_plants_daily_seed")
        ),
        sa.UniqueConstraint("space_id", "slot", name=op.f("uq_garden_plants_slot")),
        sa.CheckConstraint(
            "species IN ('POPPY', 'BELLFLOWER', 'STARFLOWER')",
            name=op.f("ck_garden_plants_species_allowed"),
        ),
        sa.CheckConstraint(
            "words IS NULL OR words IN ('THINKING_OF_YOU', 'MISS_YOU', 'LOOKING_FORWARD', "
            "'GOOD_NIGHT', 'FOR_YOU')",
            name=op.f("ck_garden_plants_words_allowed"),
        ),
        sa.CheckConstraint("stage BETWEEN 0 AND 3", name=op.f("ck_garden_plants_stage_bounded")),
        sa.CheckConstraint(
            "sender_id <> receiver_id", name=op.f("ck_garden_plants_sender_is_not_receiver")
        ),
        sa.CheckConstraint(
            "(planted_at IS NULL AND slot IS NULL AND stage = 0)"
            " OR (planted_at IS NOT NULL AND slot IS NOT NULL AND slot >= 0)",
            name=op.f("ck_garden_plants_planted_has_slot"),
        ),
    )
    op.create_index("ix_garden_plants_space_id", "garden_plants", ["space_id"])
    op.create_table(
        "garden_waterings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "plant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("garden_plants.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("watered_on", sa.Date(), nullable=False),
        sa.UniqueConstraint(
            "space_id", "account_id", "watered_on", name=op.f("uq_garden_waterings_daily")
        ),
    )
    _catalog(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM notification_preferences WHERE kind = {_NEW_KIND}")
    op.execute(f"DELETE FROM outbox_events WHERE event_type = {_NEW_KIND}")
    op.execute(f"DELETE FROM activities WHERE target_type = {_NEW_TARGET}")
    _catalog(False)
    op.drop_table("garden_waterings")
    op.drop_index("ix_garden_plants_space_id", table_name="garden_plants")
    op.drop_table("garden_plants")
