"""Bind an optional validated cover image to a shared Plan.

Revision ID: 0091
Revises: 0090
Create Date: 2026-10-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0091"
down_revision = "0090"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plans", sa.Column("cover_attachment_id", postgresql.UUID(as_uuid=True)))
    op.create_foreign_key(
        "fk_plans_cover_attachment_id_attachments",
        "plans",
        "attachments",
        ["cover_attachment_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_plans_cover_attachment", "plans", ["cover_attachment_id"])


def downgrade() -> None:
    op.drop_constraint("uq_plans_cover_attachment", "plans", type_="unique")
    op.drop_constraint("fk_plans_cover_attachment_id_attachments", "plans", type_="foreignkey")
    op.drop_column("plans", "cover_attachment_id")
