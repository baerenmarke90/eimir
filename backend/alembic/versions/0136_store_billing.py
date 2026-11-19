"""Store billing: App Store source type and opaque purchase references (#1525).

Revision ID: 0136
Revises: 0135
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0136"
down_revision = "0135"
branch_labels = None
depends_on = None

_SOURCES = "'GOOGLE_PLAY', 'CLOUD_STRIPE', 'SELF_HOSTED_KEY', 'ADMIN_GRANT', 'TEST_FIXTURE'"


def upgrade() -> None:
    op.drop_constraint("entitlement_source_type_valid", "entitlement_grants", type_="check")
    op.create_check_constraint(
        "entitlement_source_type_valid",
        "entitlement_grants",
        f"source_type IN ({_SOURCES}, 'APP_STORE')",
    )
    op.create_table(
        "store_purchase_references",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("reference", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("store", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("store IN ('GOOGLE_PLAY', 'APP_STORE')", name="store_is_known"),
        sa.UniqueConstraint("reference", name="uq_store_purchase_references_reference"),
        sa.UniqueConstraint(
            "account_id", "space_id", "store", name="uq_store_purchase_references_binding"
        ),
    )
    op.create_index(
        "ix_store_purchase_references_account_id", "store_purchase_references", ["account_id"]
    )
    op.create_index(
        "ix_store_purchase_references_space_id", "store_purchase_references", ["space_id"]
    )


def downgrade() -> None:
    op.drop_table("store_purchase_references")
    op.execute("DELETE FROM entitlement_grants WHERE source_type = 'APP_STORE'")
    op.drop_constraint("entitlement_source_type_valid", "entitlement_grants", type_="check")
    op.create_check_constraint(
        "entitlement_source_type_valid", "entitlement_grants", f"source_type IN ({_SOURCES})"
    )
