"""Audit actions of the operator plugin for support reports (#2189).

The operator plugin triages and answers support reports and links them to a
tracker ticket. Each privileged change is recorded in the content-free action
audit, so the ``action_valid`` check admits four more action names. The plugin
owns no audit table; the actions live in the Core audit like every other
privileged operation.

Revision ID: 0176
Revises: 0175
"""

from __future__ import annotations

from alembic import op

revision = "0176"
down_revision = "0175"
branch_labels = None
depends_on = None

# The actions as of 0064, the last revision that changed the list.
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
)

_SUPPORT_REPORT_ACTIONS = (
    "support_report.state_set",
    "support_report.reply_sent",
    "support_report.ticket_created",
    "support_report.ticket_cleared",
)

ACTIONS = _PREVIOUS_ACTIONS + _SUPPORT_REPORT_ACTIONS


def _in_list(actions: tuple[str, ...]) -> str:
    return "action IN (" + ", ".join(f"'{action}'" for action in actions) + ")"


def upgrade() -> None:
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(ACTIONS)
    )


def downgrade() -> None:
    # Entries of the removed actions cannot satisfy the narrower constraint.
    op.execute(
        "DELETE FROM instance_administration_action_events WHERE action IN ("
        + ", ".join(f"'{action}'" for action in _SUPPORT_REPORT_ACTIONS)
        + ")"
    )
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(_PREVIOUS_ACTIONS)
    )
