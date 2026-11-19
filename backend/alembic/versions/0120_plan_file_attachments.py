"""Add PDF documents to the attachment lifecycle and bind them to Plans.

Revision ID: 0120
Revises: 0119
"""

import sqlalchemy as sa
from alembic import op

revision = "0120"
down_revision = "0119"
branch_labels = None
depends_on = None


def _media_constraint(types: str) -> None:
    name = op.f("ck_attachments_media_type_is_known")
    op.drop_constraint(name, "attachments", type_="check")
    op.create_check_constraint(name, "attachments", f"media_type IN ({types})")


def upgrade() -> None:
    _media_constraint("'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'")
    op.create_table(
        "plan_file_attachments",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column(
            "plan_id", sa.UUID(), sa.ForeignKey("plans.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "attachment_id",
            sa.UUID(),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("attachment_id", name="uq_plan_file_attachments_attachment"),
    )
    op.create_index("ix_plan_file_attachments_plan_id", "plan_file_attachments", ["plan_id"])


def downgrade() -> None:
    if (
        op.get_bind()
        .execute(sa.text("SELECT EXISTS (SELECT 1 FROM attachments WHERE media_type = 'DOCUMENT')"))
        .scalar()
    ):
        raise RuntimeError("Cannot downgrade while document attachments remain.")
    op.drop_table("plan_file_attachments")
    _media_constraint("'IMAGE', 'VIDEO', 'AUDIO'")
