"""Verify authentication architecture model boundaries without a database."""

from __future__ import annotations

from eimir.identity.models import (
    AccountRecoveryToken,
    EmailVerificationToken,
    MagicLinkToken,
    WebAuthnCredential,
)


def test_cloud_actions_have_distinct_tables() -> None:
    assert {
        EmailVerificationToken.__tablename__,
        MagicLinkToken.__tablename__,
        AccountRecoveryToken.__tablename__,
    } == {
        "email_verification_tokens",
        "magic_link_tokens",
        "account_recovery_tokens",
    }


def test_passkey_fields_are_not_a_generic_secret() -> None:
    columns = WebAuthnCredential.__table__.columns
    assert {
        "credential_id",
        "public_key",
        "sign_count",
        "aaguid",
        "transports",
        "backup_eligible",
        "backup_state",
    }.issubset(columns.keys())
    assert "secret_hash" not in columns
