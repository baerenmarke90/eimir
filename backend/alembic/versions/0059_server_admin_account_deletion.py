"""ServerAdmin Account deletion audit action.

Revision ID: 0059
Revises: 0058
Create Date: 2026-09-19
"""

from __future__ import annotations

from alembic import op

revision = "0059"
down_revision = "0058"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid",
        "instance_administration_action_events",
        "action IN ("
        "'account_suspended', "
        "'account_unsuspended', "
        "'account_sessions_revoked', "
        "'account_email_verified', "
        "'account_recovery_email_requested', "
        "'account_recovery_issued', "
        "'space_entitlement_granted', "
        "'space_entitlement_revoked', "
        "'account_deletion_requested'"
        ")",
    )


def downgrade() -> None:
    op.drop_constraint("action_valid", "instance_administration_action_events", type_="check")
    op.create_check_constraint(
        "action_valid",
        "instance_administration_action_events",
        "action IN ("
        "'account_suspended', "
        "'account_unsuspended', "
        "'account_sessions_revoked', "
        "'account_email_verified', "
        "'account_recovery_email_requested', "
        "'account_recovery_issued', "
        "'space_entitlement_granted', "
        "'space_entitlement_revoked'"
        ")",
    )
