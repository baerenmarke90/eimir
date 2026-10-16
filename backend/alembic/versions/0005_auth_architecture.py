"""OIDC, WebAuthn and cloud action-token architecture

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def _token_columns() -> list[sa.Column]:
    return [
        # Only the hash is persisted; plaintext is handed once to the calling
        # delivery/UI adapter.
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.add_column("auth_identities", sa.Column("issuer", sa.String(length=512)))
    op.add_column("auth_identities", sa.Column("connection_id", sa.String(length=128)))

    # Before this migration there was no OIDC flow, but the enum allowed rows
    # to be created manually. Preserve those rows and deliberately mark them as
    # unresolved until they are linked again with a real issuer. This keeps the
    # upgrade safe for an existing database without assigning an identity to
    # the wrong account.
    op.execute(
        sa.text(
            """
            UPDATE auth_identities
               SET issuer = 'urn:eimir:legacy-unresolved:' || id::text,
                   connection_id = 'legacy-unresolved'
             WHERE provider = 'OIDC'
            """
        )
    )

    op.drop_constraint(
        "uq_auth_identities_provider_subject", "auth_identities", type_="unique"
    )
    op.create_unique_constraint(
        "uq_auth_identities_issuer_subject",
        "auth_identities",
        ["issuer", "subject"],
    )
    op.create_index(
        "uq_auth_identities_non_oidc_provider_subject",
        "auth_identities",
        ["provider", "subject"],
        unique=True,
        postgresql_where=sa.text("provider <> 'OIDC'"),
    )
    op.create_check_constraint(
        "oidc_metadata_matches_provider",
        "auth_identities",
        "(provider = 'OIDC' AND issuer IS NOT NULL AND connection_id IS NOT NULL) "
        "OR (provider <> 'OIDC' AND issuer IS NULL AND connection_id IS NULL)",
    )

    op.create_table(
        "webauthn_credentials",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), nullable=False),
        sa.Column("aaguid", UUID, nullable=True),
        sa.Column(
            "transports",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_discoverable", sa.Boolean(), nullable=False),
        sa.Column("backup_eligible", sa.Boolean(), nullable=False),
        sa.Column("backup_state", sa.Boolean(), nullable=False),
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
        sa.CheckConstraint("sign_count >= 0", name="sign_count_is_non_negative"),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_webauthn_credentials_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_webauthn_credentials"),
        sa.UniqueConstraint(
            "credential_id", name="uq_webauthn_credentials_credential_id"
        ),
    )
    op.create_index(
        "ix_webauthn_credentials_account_id", "webauthn_credentials", ["account_id"]
    )

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_email_id", UUID, nullable=False),
        *_token_columns(),
        sa.ForeignKeyConstraint(
            ["account_email_id"],
            ["account_emails.id"],
            name="fk_email_verification_tokens_account_email_id_account_emails",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_email_verification_tokens"),
        sa.UniqueConstraint(
            "token_hash", name="uq_email_verification_tokens_token_hash"
        ),
    )
    op.create_index(
        "ix_email_verification_tokens_account_email_id",
        "email_verification_tokens",
        ["account_email_id"],
    )
    op.create_index(
        "ix_email_verification_tokens_expires_at",
        "email_verification_tokens",
        ["expires_at"],
    )

    op.create_table(
        "magic_link_tokens",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_email_id", UUID, nullable=False),
        *_token_columns(),
        sa.ForeignKeyConstraint(
            ["account_email_id"],
            ["account_emails.id"],
            name="fk_magic_link_tokens_account_email_id_account_emails",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_magic_link_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_magic_link_tokens_token_hash"),
    )
    op.create_index(
        "ix_magic_link_tokens_account_email_id",
        "magic_link_tokens",
        ["account_email_id"],
    )
    op.create_index(
        "ix_magic_link_tokens_expires_at", "magic_link_tokens", ["expires_at"]
    )

    op.create_table(
        "account_recovery_tokens",
        sa.Column("id", UUID, nullable=False),
        sa.Column("account_id", UUID, nullable=False),
        *_token_columns(),
        sa.ForeignKeyConstraint(
            ["account_id"],
            ["accounts.id"],
            name="fk_account_recovery_tokens_account_id_accounts",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_account_recovery_tokens"),
        sa.UniqueConstraint(
            "token_hash", name="uq_account_recovery_tokens_token_hash"
        ),
    )
    op.create_index(
        "ix_account_recovery_tokens_account_id",
        "account_recovery_tokens",
        ["account_id"],
    )
    op.create_index(
        "ix_account_recovery_tokens_expires_at",
        "account_recovery_tokens",
        ["expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_account_recovery_tokens_expires_at", table_name="account_recovery_tokens"
    )
    op.drop_index(
        "ix_account_recovery_tokens_account_id", table_name="account_recovery_tokens"
    )
    op.drop_table("account_recovery_tokens")

    op.drop_index("ix_magic_link_tokens_expires_at", table_name="magic_link_tokens")
    op.drop_index("ix_magic_link_tokens_account_email_id", table_name="magic_link_tokens")
    op.drop_table("magic_link_tokens")

    op.drop_index(
        "ix_email_verification_tokens_expires_at",
        table_name="email_verification_tokens",
    )
    op.drop_index(
        "ix_email_verification_tokens_account_email_id",
        table_name="email_verification_tokens",
    )
    op.drop_table("email_verification_tokens")

    op.drop_index("ix_webauthn_credentials_account_id", table_name="webauthn_credentials")
    op.drop_table("webauthn_credentials")

    op.drop_constraint(
        op.f("ck_auth_identities_oidc_metadata_matches_provider"),
        "auth_identities",
        type_="check",
    )
    op.drop_index(
        "uq_auth_identities_non_oidc_provider_subject", table_name="auth_identities"
    )
    op.drop_constraint(
        "uq_auth_identities_issuer_subject", "auth_identities", type_="unique"
    )
    op.create_unique_constraint(
        "uq_auth_identities_provider_subject",
        "auth_identities",
        ["provider", "subject"],
    )
    op.drop_column("auth_identities", "connection_id")
    op.drop_column("auth_identities", "issuer")
