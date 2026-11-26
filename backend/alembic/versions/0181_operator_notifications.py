"""Operator notifications: ServerAdmin alerts as app push (#2314 part 2b).

A ServerAdmin alert belongs to no Space. ``notifications.space_id`` becomes
nullable, allowed NULL only for the new kind ``OPERATOR_ALERT``, and the new
column ``operator_topic`` names the alert code for that kind only. The rows are
never shown in a couple's Notification Center; they exist for the push
pipeline and its tap. A second instance switch, ``monitoring_push_enabled``,
turns the alert push on or off independently of the alert mails.

Revision ID: 0181
Revises: 0180
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0181"
down_revision = "0180"
branch_labels = None
depends_on = None

# The catalog as of 0175, the last revision that changed it.
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
    "'COUPLE_GAME_TURN', 'PICTURE_PING_PONG_FINISHED', 'SUPPORT_REPLY'"
)
_NEW_KIND = "'OPERATOR_ALERT'"
_TOPICS = (
    "'failed_jobs', 'space_quota_pressure', 'disk_pressure', 'delivery_failures', "
    "'backup_not_configured', 'support_reports'"
)
_OLD_SETTINGS = (
    "setting IN ('registration_enabled', 'maintenance_mode', 'monitoring_alerts_enabled')"
)
_NEW_SETTINGS = (
    "setting IN ('registration_enabled', 'maintenance_mode', "
    "'monitoring_alerts_enabled', 'monitoring_push_enabled')"
)


def _catalog(include_operator: bool) -> None:
    kinds = _KINDS + (f", {_NEW_KIND}" if include_operator else "")
    for table, name in (
        ("notifications", "notification_kind_allowed"),
        ("notification_preferences", "notif_pref_kind_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(name, table, f"kind IN ({kinds})")


def _settings_constraint(expression: str) -> None:
    op.drop_constraint(
        op.f("ck_instance_administration_events_setting_valid"),
        "instance_administration_events",
        type_="check",
    )
    op.create_check_constraint("setting_valid", "instance_administration_events", expression)


def upgrade() -> None:
    _catalog(True)
    op.add_column("notifications", sa.Column("operator_topic", sa.String(32), nullable=True))
    op.alter_column("notifications", "space_id", existing_type=sa.UUID(), nullable=True)
    op.create_check_constraint(
        "notification_space_matches_kind",
        "notifications",
        f"(space_id IS NULL) = (kind = {_NEW_KIND})",
    )
    op.create_check_constraint(
        "notification_operator_topic_matches_kind",
        "notifications",
        f"(operator_topic IS NULL) = (kind <> {_NEW_KIND})",
    )
    op.create_check_constraint(
        "notification_operator_topic_allowed",
        "notifications",
        f"operator_topic IS NULL OR operator_topic IN ({_TOPICS})",
    )
    op.create_index(
        "ix_notifications_operator_expires_at",
        "notifications",
        ["expires_at"],
        postgresql_where=sa.text("space_id IS NULL"),
    )
    op.add_column(
        "instance_administration_settings",
        sa.Column(
            "monitoring_push_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    _settings_constraint(_NEW_SETTINGS)


def downgrade() -> None:
    op.execute(
        "DELETE FROM instance_administration_events WHERE setting = 'monitoring_push_enabled'"
    )
    _settings_constraint(_OLD_SETTINGS)
    op.drop_column("instance_administration_settings", "monitoring_push_enabled")
    # Push deliveries of operator notices cascade with their notification.
    op.execute(f"DELETE FROM notifications WHERE kind IN ({_NEW_KIND})")
    op.execute(f"DELETE FROM notification_preferences WHERE kind IN ({_NEW_KIND})")
    op.drop_index("ix_notifications_operator_expires_at", table_name="notifications")
    for name in (
        "notification_operator_topic_allowed",
        "notification_operator_topic_matches_kind",
        "notification_space_matches_kind",
    ):
        op.drop_constraint(op.f(f"ck_notifications_{name}"), "notifications", type_="check")
    op.alter_column("notifications", "space_id", existing_type=sa.UUID(), nullable=False)
    op.drop_column("notifications", "operator_topic")
    _catalog(False)
