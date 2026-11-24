"""Archive marker and delete audit actions for support reports (#2189).

The operator can archive a report, which hides it from the default lists without
changing its triage state, and delete one permanently. ``archived_at`` is a
nullable marker next to ``state`` rather than a fourth state, so unarchiving
restores the earlier state and the ``closed_at`` retention clock is untouched.
Three audit actions join the content-free action audit.

Revision ID: 0177
Revises: 0176
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0177"
down_revision = "0176"
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
    "account_deletion_requested",
    "account_deletion_completed",
    "account_deletion_failed",
    "space_configuration_manager_reconciled",
    "support_report.state_set",
    "support_report.reply_sent",
    "support_report.ticket_created",
    "support_report.ticket_cleared",
)

_NEW_ACTIONS = (
    "support_report.archived",
    "support_report.unarchived",
    "support_report.deleted",
)

ACTIONS = _PREVIOUS_ACTIONS + _NEW_ACTIONS


def _in_list(actions: tuple[str, ...]) -> str:
    return "action IN (" + ", ".join(f"'{action}'" for action in actions) + ")"


def upgrade() -> None:
    op.add_column(
        "support_reports", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid",
        "instance_administration_action_events",
        _in_list(ACTIONS),
    )


def downgrade() -> None:
    # Entries of the removed actions cannot satisfy the narrower constraint.
    op.execute(
        "DELETE FROM instance_administration_action_events WHERE action IN ("
        + ", ".join(f"'{action}'" for action in _NEW_ACTIONS)
        + ")"
    )
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(_PREVIOUS_ACTIONS)
    )
    op.drop_column("support_reports", "archived_at")
