"""Persist authoritative Space configuration-manager identity.

Revision ID: 0062
Revises: 0061
Create Date: 2026-09-20

#432 requires configuration authority to be durable Space state rather than a
client or Membership-order heuristic. All new Spaces persist the founder.

For legacy data, automatic backfill is deliberately conservative. A Space with
exactly one Membership has one provable founder because every historical Space
creation path atomically created the founder Membership and Membership rows are
retained after offboarding. A Space with multiple Memberships is ambiguous
without a pre-existing creator field; it remains NULL rather than guessing from
joined_at, row order, invitation history, or Account timestamps. NULL therefore
means "configuration management unavailable until an explicit reconciliation
assigns an authority", never "either partner may write".
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0062"
down_revision = "0061"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "spaces",
        sa.Column(
            "configuration_manager_account_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_spaces_configuration_manager_account_id_accounts",
        "spaces",
        "accounts",
        ["configuration_manager_account_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        sa.text(
            """
            UPDATE spaces AS s
            SET configuration_manager_account_id = (
                SELECT m.account_id
                FROM memberships AS m
                WHERE m.space_id = s.id
                LIMIT 1
            )
            WHERE s.configuration_manager_account_id IS NULL
              AND (
                  SELECT COUNT(*)
                  FROM memberships AS m
                  WHERE m.space_id = s.id
              ) = 1
            """
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_spaces_configuration_manager_account_id_accounts",
        "spaces",
        type_="foreignkey",
    )
    op.drop_column("spaces", "configuration_manager_account_id")
