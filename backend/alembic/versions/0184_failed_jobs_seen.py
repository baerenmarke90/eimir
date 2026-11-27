"""ServerAdmin marks the current failed jobs as seen (#2342).

The instance settings row stores when an operator last marked the failed jobs
as seen; the Situation page then lists only jobs that failed afterwards. The
content-free administration audit gains the action ``failed_jobs_seen``.

Revision ID: 0184
Revises: 0183
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0184"
down_revision = "0183"
branch_labels = None
depends_on = None

_PREVIOUS_ACTIONS = (
    "account_suspended",
    "account_unsuspended",
    "account_sessions_revoked",
    "account_email_verified",
    "account_recovery_email_requested",
    "account_recovery_issued",
    "space_entitlement_granted",
    "space_entitlement_revoked",
    "space_configuration_manager_reconciled",
    "account_deletion_requested",
    "account_deletion_completed",
    "account_deletion_failed",
    "support_report.state_set",
    "support_report.reply_sent",
    "support_report.ticket_created",
    "support_report.ticket_cleared",
    "support_report.archived",
    "support_report.unarchived",
    "support_report.deleted",
    "space_storage_quota_set",
    "space_storage_quota_cleared",
    "space_file_viewed",
)

_NEW_ACTIONS = ("failed_jobs_seen",)

ACTIONS = _PREVIOUS_ACTIONS + _NEW_ACTIONS


def _in_list(actions: tuple[str, ...]) -> str:
    return "action IN (" + ", ".join(f"'{action}'" for action in actions) + ")"


def _replace_constraint(actions: tuple[str, ...]) -> None:
    op.drop_constraint(
        op.f("ck_instance_administration_action_events_action_valid"),
        "instance_administration_action_events",
        type_="check",
    )
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(actions)
    )


def upgrade() -> None:
    op.add_column(
        "instance_administration_settings",
        sa.Column("failed_jobs_seen_at", sa.DateTime(timezone=True), nullable=True),
    )
    _replace_constraint(ACTIONS)


def downgrade() -> None:
    # Entries of the removed action cannot satisfy the narrower constraint.
    op.execute(
        "DELETE FROM instance_administration_action_events WHERE action IN ("
        + ", ".join(f"'{action}'" for action in _NEW_ACTIONS)
        + ")"
    )
    _replace_constraint(_PREVIOUS_ACTIONS)
    op.drop_column("instance_administration_settings", "failed_jobs_seen_at")
