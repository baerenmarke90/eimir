"""Allow protected audio attachments for HeartMoments.

Revision ID: 0114
Revises: 0113
"""

from alembic import op

revision = "0114"
down_revision = "0113"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_attachments_media_type_is_known"), "attachments", type_="check")
    op.create_check_constraint(
        op.f("ck_attachments_media_type_is_known"),
        "attachments",
        "media_type IN ('IMAGE', 'VIDEO', 'AUDIO')",
    )


def downgrade() -> None:
    # Fail closed if audio exists; downgrade must never delete relationship content.
    op.drop_constraint(op.f("ck_attachments_media_type_is_known"), "attachments", type_="check")
    op.create_check_constraint(
        op.f("ck_attachments_media_type_is_known"),
        "attachments",
        "media_type IN ('IMAGE', 'VIDEO')",
    )
