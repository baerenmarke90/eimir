"""Add the durable demo canonical-identity marker.

Revision ID: 0052
Revises: 0051
Create Date: 2026-09-14

#633: `display_name` is ordinary mutable presentation data and must stop being
the durable invariant create/ensure/reset use to recognize the two canonical
demo personas. This table is the stable alternative. It starts empty even on
an existing deployment; `eimir.demo.service` adopts the already-verified
reserved-address Accounts into it the next time `ensure`/`create`/`reset` runs,
so no manual data migration is required. Dropping the table is a full,
lossless rollback: the marker carries no data that anything else depends on.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0052"
down_revision = "0051"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "demo_canonical_identities",
        sa.Column("persona", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("account_id", UUID, nullable=False),
        sa.PrimaryKeyConstraint("persona", name="pk_demo_canonical_identities"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_demo_canonical_identities_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("account_id", name="uq_demo_canonical_identities_account_id"),
        sa.CheckConstraint("persona IN ('LEA', 'ALEX')", name="persona_is_known"),
    )


def downgrade() -> None:
    op.drop_table("demo_canonical_identities")
