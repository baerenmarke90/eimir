"""ServerAdmin Space entitlement grant/revoke audit actions.

Revision ID: 0043
Revises: 0042
Create Date: 2026-09-05
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "instance_administration_action_events",
        sa.Column("target_space_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_instance_administration_action_events_target_space_id_spaces",
        "instance_administration_action_events",
        "spaces",
        ["target_space_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_instance_administration_action_events_target_space",
        "instance_administration_action_events",
        ["target_space_id"],
        unique=False,
    )

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
        "'account_recovery_issued'"
        ")",
    )

    op.drop_index(
        "ix_instance_administration_action_events_target_space",
        table_name="instance_administration_action_events",
    )
    op.drop_constraint(
        "fk_instance_administration_action_events_target_space_id_spaces",
        "instance_administration_action_events",
        type_="foreignkey",
    )
    op.drop_column("instance_administration_action_events", "target_space_id")
