"""identity and relationship

The security foundation: accounts, authentication methods, device sessions,
spaces, and memberships. This precedes every content domain so content cannot
exist before ownership is defined.

Constraint names use the BARE name here, for example "status_is_known".
The naming convention in db/base.py prepends "ck_<table>_". Supplying the
already resolved name would prefix it a second time and, for longer names,
would additionally hit PostgreSQL's 63-character identifier limit. The CI
drift check catches this, but only after wasting a run.

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-23
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _timestamps() -> list[sa.Column]:
    return [
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
    ]


def upgrade() -> None:
    op.create_table(
        "accounts",
        sa.Column("id", UUID, nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column("locale", sa.String(length=16), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_accounts"),
    )

    op.create_table(
        "account_emails",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_account_emails"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_account_emails_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("email", name="uq_account_emails_email"),
        # Store addresses in lowercase; otherwise "A@b.de" and "a@b.de"
        # would be distinct addresses and uniqueness would have a gap.
        sa.CheckConstraint("email = lower(email)", name="email_is_lowercase"),
    )

    op.create_table(
        "auth_identities",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("subject", sa.String(length=512), nullable=False),
        sa.Column("secret_hash", sa.String(length=255), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_auth_identities"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_auth_identities_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("provider", "subject", name="uq_auth_identities_provider_subject"),
        sa.CheckConstraint(
            "provider IN ('MAGIC_LINK', 'PASSKEY', 'LOCAL_PASSWORD', 'OIDC')",
            name="provider_is_known",
        ),
    )
    op.create_index("ix_auth_identities_account_id", "auth_identities", ["account_id"])

    op.create_table(
        "device_sessions",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("device_name", sa.String(length=120), nullable=False),
        sa.Column("platform", sa.String(length=32), nullable=False),
        # Hashes only. Reading the database must not provide login credentials.
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("previous_refresh_token_hash", sa.String(length=64), nullable=True),
        sa.Column("access_token_hash", sa.String(length=64), nullable=True),
        sa.Column("access_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_device_sessions"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_device_sessions_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("refresh_token_hash", name="uq_device_sessions_refresh_token_hash"),
    )
    op.create_index(
        "ix_device_sessions_access_token_hash", "device_sessions", ["access_token_hash"]
    )
    op.create_index("ix_device_sessions_account_id", "device_sessions", ["account_id"])

    op.create_table(
        "spaces",
        sa.Column("id", UUID, nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_spaces"),
    )

    op.create_table(
        "memberships",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_memberships"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_memberships_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_memberships_account_id_accounts",
            ondelete="CASCADE",
        ),
        # An account may be a member of a space at most once. Two rows would
        # create two conflicting truths about whether the account has access.
        sa.UniqueConstraint("space_id", "account_id", name="uq_memberships_space_id_account_id"),
        sa.CheckConstraint(
            "status IN ('ACTIVE', 'LEFT', 'REMOVED')",
            name="status_is_known",
        ),
        sa.CheckConstraint("role IN ('PARTNER')", name="role_is_known"),
    )
    # The guard checks exactly this combination on every request.
    op.create_index(
        "ix_memberships_account_id_space_id_status",
        "memberships",
        ["account_id", "space_id", "status"],
    )

    op.create_table(
        "space_profiles",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("relationship_started_on", sa.Date(), nullable=True),
        sa.Column("show_relationship_duration", sa.Boolean(), nullable=False),
        sa.Column("duration_display_mode", sa.String(length=16), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_space_profiles"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_space_profiles_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("space_id", name="uq_space_profiles_space_id"),
        sa.CheckConstraint(
            "duration_display_mode IN ('YEARS_MONTHS', 'DAYS')",
            name="duration_display_mode_is_known",
        ),
    )


def downgrade() -> None:
    op.drop_table("space_profiles")
    op.drop_index("ix_memberships_account_id_space_id_status", table_name="memberships")
    op.drop_table("memberships")
    op.drop_table("spaces")
    op.drop_index("ix_device_sessions_account_id", table_name="device_sessions")
    op.drop_index("ix_device_sessions_access_token_hash", table_name="device_sessions")
    op.drop_table("device_sessions")
    op.drop_index("ix_auth_identities_account_id", table_name="auth_identities")
    op.drop_table("auth_identities")
    op.drop_table("account_emails")
    op.drop_table("accounts")
