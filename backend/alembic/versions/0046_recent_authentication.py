"""Add isolated recent-authentication state.

Revision ID: 0046
Revises: 0045
Create Date: 2026-09-06
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0046"
down_revision = "0045"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "recent_auth_grants",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("device_session_id", UUID, nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("method", sa.String(length=32), nullable=False),
        sa.Column("achieved_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "method IN ('LOCAL_PASSWORD', 'PASSKEY', 'OIDC')",
            name="method_known",
        ),
        sa.CheckConstraint(
            "expires_at > achieved_at",
            name="expiry_after_achievement",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["device_session_id"],
            ["device_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "account_id",
            "device_session_id",
            "purpose",
            name="uq_recent_auth_grants_context",
        ),
    )
    op.create_index(
        "ix_recent_auth_grants_expires_at",
        "recent_auth_grants",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_recent_auth_grants_device_session_id",
        "recent_auth_grants",
        ["device_session_id"],
        unique=False,
    )

    op.create_table(
        "recent_auth_webauthn",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("device_session_id", UUID, nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("challenge", sa.LargeBinary(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["device_session_id"],
            ["device_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_recent_auth_webauthn_expires_at",
        "recent_auth_webauthn",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_recent_auth_webauthn_context",
        "recent_auth_webauthn",
        ["account_id", "device_session_id"],
        unique=False,
    )

    op.create_table(
        "recent_auth_oidc",
        sa.Column("id", UUID, nullable=False),
        sa.Column("connection_id", sa.String(length=64), nullable=False),
        sa.Column("state_hash", sa.String(length=64), nullable=False),
        sa.Column("redirect_uri", sa.String(length=512), nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("device_session_id", UUID, nullable=False),
        sa.Column("purpose", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["device_session_id"],
            ["device_sessions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("state_hash", name="uq_recent_auth_oidc_state_hash"),
    )
    op.create_index(
        "ix_recent_auth_oidc_expires_at",
        "recent_auth_oidc",
        ["expires_at"],
        unique=False,
    )
    op.create_index(
        "ix_recent_auth_oidc_context",
        "recent_auth_oidc",
        ["account_id", "device_session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_recent_auth_oidc_context", table_name="recent_auth_oidc")
    op.drop_index("ix_recent_auth_oidc_expires_at", table_name="recent_auth_oidc")
    op.drop_table("recent_auth_oidc")

    op.drop_index("ix_recent_auth_webauthn_context", table_name="recent_auth_webauthn")
    op.drop_index("ix_recent_auth_webauthn_expires_at", table_name="recent_auth_webauthn")
    op.drop_table("recent_auth_webauthn")

    op.drop_index("ix_recent_auth_grants_device_session_id", table_name="recent_auth_grants")
    op.drop_index("ix_recent_auth_grants_expires_at", table_name="recent_auth_grants")
    op.drop_table("recent_auth_grants")
