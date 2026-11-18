"""Add ordered supplemental Plan photos without changing existing covers.

Revision ID: 0092
Revises: 0091
Create Date: 2026-10-30
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0092"
down_revision = "0091"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("plan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attachment_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["plan_id"], ["plans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attachment_id"], ["attachments.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("attachment_id", name="uq_plan_attachments_attachment"),
        sa.UniqueConstraint("plan_id", "position", name="uq_plan_attachments_position"),
        sa.CheckConstraint(
            "position > 0", name=op.f("ck_plan_attachments_position_is_supplemental")
        ),
    )
    op.create_index("ix_plan_attachments_plan_id", "plan_attachments", ["plan_id"])


def downgrade() -> None:
    # A downgrade cannot silently orphan supplemental photos. The operator must
    # export/remove those photos through the supported application first.
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM plan_attachments)")).scalar():
        raise RuntimeError("Cannot downgrade while supplemental Plan photos remain.")
    op.drop_table("plan_attachments")
