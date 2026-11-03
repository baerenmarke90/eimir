"""Add backward-compatible ordered HeartMoment galleries.

Revision ID: 0103
Revises: 0102
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0103"
down_revision = "0102"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "heart_moment_attachments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "heart_moment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("heart_moments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "attachment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.UniqueConstraint("attachment_id", name="uq_heart_moment_attachments_attachment"),
        sa.UniqueConstraint(
            "heart_moment_id", "position", name="uq_heart_moment_attachments_position"
        ),
        sa.CheckConstraint("position > 0", name="position_is_supplemental"),
    )
    op.create_index(
        "ix_heart_moment_attachments_parent", "heart_moment_attachments", ["heart_moment_id"]
    )


def downgrade() -> None:
    # Refuse a downgrade that would silently discard supplemental user media.
    count = op.get_bind().execute(sa.text("SELECT count(*) FROM heart_moment_attachments")).scalar()
    if count:
        raise RuntimeError("Remove or export supplemental HeartMoment media before downgrading.")
    op.drop_table("heart_moment_attachments")
