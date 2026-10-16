"""Commercial capability entitlement grants.

Revision ID: 0038
Revises: 0037
Create Date: 2026-09-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0038"
down_revision = "0037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "entitlement_grants",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source_type",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column(
            "external_reference",
            sa.String(length=255),
            nullable=True,
        ),
        sa.Column(
            "source_event_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "status",
            sa.String(length=32),
            nullable=False,
        ),
        sa.Column(
            "tier",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'FREE'"),
        ),
        sa.Column(
            "effective_from",
            sa.DateTime(timezone=True),
            nullable=False,
        ),
        sa.Column(
            "effective_until",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "capabilities",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "source_type IN ("
            "'GOOGLE_PLAY', 'CLOUD_STRIPE', 'SELF_HOSTED_KEY', 'ADMIN_GRANT', 'TEST_FIXTURE'"
            ")",
            name="entitlement_source_type_valid",
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'TRIAL', 'GRACE_PERIOD', 'EXPIRED', 'REVOKED', 'GRANDFATHERED')",
            name="entitlement_status_valid",
        ),
        sa.CheckConstraint(
            "tier IN ('FREE', 'PREMIUM')",
            name="entitlement_tier_valid",
        ),
        sa.UniqueConstraint(
            "source_type",
            "external_reference",
            name="uq_entitlement_grants_source_reference",
        ),
    )
    op.create_index(
        "ix_entitlement_grants_space_id",
        "entitlement_grants",
        ["space_id"],
    )
    op.create_index(
        "ix_entitlement_grants_account_id",
        "entitlement_grants",
        ["account_id"],
    )
    op.create_index(
        "ix_entitlement_grants_space_id_status",
        "entitlement_grants",
        ["space_id", "status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_entitlement_grants_space_id_status",
        table_name="entitlement_grants",
    )
    op.drop_index(
        "ix_entitlement_grants_account_id",
        table_name="entitlement_grants",
    )
    op.drop_index(
        "ix_entitlement_grants_space_id",
        table_name="entitlement_grants",
    )
    op.drop_table("entitlement_grants")
