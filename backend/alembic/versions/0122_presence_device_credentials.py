"""Add scoped device credentials for background partner-location uploads.

Revision ID: 0122
Revises: 0121
"""

import sqlalchemy as sa
from alembic import op

revision = "0122"
down_revision = "0121"
branch_labels = None
depends_on = None

UUID = sa.UUID()


def upgrade() -> None:
    op.create_table(
        "presence_device_credentials",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("device_session_id", UUID, nullable=False),
        sa.Column("device_id", UUID, nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("consent_generation", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_presence_device_credentials"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_presence_device_credentials_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_presence_device_credentials_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["device_session_id"],
            ["device_sessions.id"],
            name=op.f("fk_presence_device_credentials_device_session_id_device_sessions"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("token_hash", name="uq_presence_device_credentials_token_hash"),
        sa.UniqueConstraint(
            "space_id",
            "account_id",
            "device_id",
            name="uq_presence_device_credentials_owner_device",
        ),
    )
    op.create_index(
        "ix_presence_device_credentials_expires_at",
        "presence_device_credentials",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_presence_device_credentials_expires_at", table_name="presence_device_credentials"
    )
    op.drop_table("presence_device_credentials")
