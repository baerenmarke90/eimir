"""Add DB-visible ownership for server-stream attachment uploads.

Revision ID: 0045
Revises: 0044
Create Date: 2026-09-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0045"
down_revision = "0044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "attachments",
        sa.Column("upload_claim_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "attachments",
        sa.Column("upload_lease_until", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "attachments",
        sa.Column("upload_claim_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "upload_claim_is_consistent",
        "attachments",
        "((upload_claim_id IS NULL AND upload_lease_until IS NULL "
        "AND upload_claim_expires_at IS NULL) OR "
        "(upload_claim_id IS NOT NULL AND upload_lease_until IS NOT NULL "
        "AND upload_claim_expires_at IS NOT NULL "
        "AND upload_lease_until <= upload_claim_expires_at))",
    )


def downgrade() -> None:
    op.drop_constraint("upload_claim_is_consistent", "attachments", type_="check")
    op.drop_column("attachments", "upload_claim_expires_at")
    op.drop_column("attachments", "upload_lease_until")
    op.drop_column("attachments", "upload_claim_id")
