"""Add transient session/parent-scoped video playback grants."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0101"
down_revision = "0100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "attachment_playback_grants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("device_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "attachment_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("attachments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("parent_type", sa.String(16), nullable=False),
        sa.Column("parent_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "parent_type IN ('MEMORY', 'HEART_MOMENT')", name="playback_parent_known"
        ),
    )
    op.create_index(
        "ix_playback_grants_session_expiry",
        "attachment_playback_grants",
        ["session_id", "expires_at"],
    )
    op.create_index("ix_playback_grants_expiry", "attachment_playback_grants", ["expires_at"])


def downgrade() -> None:
    # Grants are deliberately disposable and contain no authored relationship data.
    op.drop_table("attachment_playback_grants")
