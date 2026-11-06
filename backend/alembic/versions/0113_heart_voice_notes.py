"""Allow protected audio attachments for HeartMoments.

Revision ID: 0113
Revises: 0112
"""

from alembic import op

revision = "0113"
down_revision = "0112"
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
