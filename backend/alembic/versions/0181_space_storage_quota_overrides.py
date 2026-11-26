"""Individual Cloud storage quota per Space and Space file audit (#2324).

A ServerAdmin may replace a Space's tier quota with an individual value,
optionally until a date. Setting and clearing it, and every view of a Space
file, join the content-free administration action audit.

Revision ID: 0181
Revises: 0180
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0181"
down_revision = "0180"
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
)

_NEW_ACTIONS = (
    "space_storage_quota_set",
    "space_storage_quota_cleared",
    "space_file_viewed",
)

ACTIONS = _PREVIOUS_ACTIONS + _NEW_ACTIONS


def _in_list(actions: tuple[str, ...]) -> str:
    return "action IN (" + ", ".join(f"'{action}'" for action in actions) + ")"


def upgrade() -> None:
    op.create_table(
        "space_storage_quota_overrides",
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("quota_bytes", sa.BigInteger(), nullable=False),
        sa.Column("effective_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "set_by_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("set_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("quota_bytes > 0", name="quota_positive"),
    )
    op.drop_constraint(
        op.f("ck_instance_administration_action_events_action_valid"),
        "instance_administration_action_events",
        type_="check",
    )
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(ACTIONS)
    )


def downgrade() -> None:
    # Entries of the removed actions cannot satisfy the narrower constraint.
    op.execute(
        "DELETE FROM instance_administration_action_events WHERE action IN ("
        + ", ".join(f"'{action}'" for action in _NEW_ACTIONS)
        + ")"
    )
    op.drop_constraint(
        op.f("ck_instance_administration_action_events_action_valid"),
        "instance_administration_action_events",
        type_="check",
    )
    op.create_check_constraint(
        "action_valid", "instance_administration_action_events", _in_list(_PREVIOUS_ACTIONS)
    )
    op.drop_table("space_storage_quota_overrides")
