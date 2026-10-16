"""ServerAdmin Account deletion outcome audit actions.

Revision ID: 0061
Revises: 0060
Create Date: 2026-09-20
"""

from __future__ import annotations

from alembic import op

revision = "0061"
down_revision = "0060"
branch_labels = None
depends_on = None


_BASE_ACTIONS = (
    "'account_suspended', "
    "'account_unsuspended', "
    "'account_sessions_revoked', "
    "'account_email_verified', "
    "'account_recovery_email_requested', "
    "'account_recovery_issued', "
    "'space_entitlement_granted', "
    "'space_entitlement_revoked', "
    "'account_deletion_requested'"
)


def upgrade() -> None:
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid",
        "instance_administration_action_events",
        f"action IN ({_BASE_ACTIONS}, 'account_deletion_completed', 'account_deletion_failed')",
    )


def downgrade() -> None:
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid",
        "instance_administration_action_events",
        f"action IN ({_BASE_ACTIONS})",
    )
