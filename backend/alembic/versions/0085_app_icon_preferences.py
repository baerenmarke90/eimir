"""Store personal app-icon preferences.

Revision ID: 0085
Revises: 0084
Create Date: 2026-10-12
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0085"
down_revision = "0084"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_icon_preferences",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("space_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("icon_id", sa.String(24), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.PrimaryKeyConstraint("id", name="pk_app_icon_preferences"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
            name="fk_app_icon_preferences_account_id_accounts",
        ),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            ondelete="CASCADE",
            name="fk_app_icon_preferences_space_id_spaces",
        ),
        sa.UniqueConstraint(
            "account_id", "space_id", name="uq_app_icon_preferences_account_id_space_id"
        ),
    )
    op.create_index("ix_app_icon_preferences_account_id", "app_icon_preferences", ["account_id"])
    op.create_index("ix_app_icon_preferences_space_id", "app_icon_preferences", ["space_id"])


def downgrade() -> None:
    op.drop_table("app_icon_preferences")
