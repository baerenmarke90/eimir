"""Protect new Push endpoint registration material at rest.

Revision ID: 0083
Revises: 0082
Create Date: 2026-09-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0083"
down_revision = "0082"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "push_endpoint_secrets",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("push_endpoint_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), nullable=False, server_default="0"),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_push_endpoint_secrets"),
        sa.ForeignKeyConstraint(
            ["push_endpoint_id"],
            ["push_endpoints.id"],
            name="fk_push_endpoint_secrets_push_endpoint_id_push_endpoints",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("push_endpoint_id", name="uq_push_endpoint_secrets_push_endpoint_id"),
        sa.CheckConstraint("crypto_version >= 0", name="endpoint_secret_crypto_valid"),
    )


def downgrade() -> None:
    # The previous app version cannot read the protected value. Stop its worker
    # from treating the non-secret SHA-256 reference as a deliverable endpoint.
    op.execute(
        "UPDATE push_endpoints SET disabled_at = now() "
        "WHERE id IN (SELECT push_endpoint_id FROM push_endpoint_secrets)"
    )
    op.drop_table("push_endpoint_secrets")
