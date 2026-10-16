"""Persistence invariants for OIDC, passkeys, and cloud authentication tokens."""

from __future__ import annotations

import logging
from datetime import timedelta

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from eimir.auth import action_tokens
from eimir.core.clock import now
from eimir.core.errors import ValidationError
from eimir.identity import service
from eimir.identity.models import AccountEmail
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _email(session: Session, account, address: str) -> AccountEmail:  # type: ignore[no-untyped-def]
    model = AccountEmail(account_id=account.id, email=address, is_primary=True)
    session.add(model)
    session.flush()
    return model


class TestOidcIdentities:
    def test_subject_is_scoped_by_issuer(self, session: Session) -> None:
        first = make_account(session, "Erste Person")
        second = make_account(session, "Zweite Person")

        left = service.add_oidc_identity(
            session,
            first,
            issuer="https://issuer-one.example",
            subject="same-subject",
            connection_id="company-login",
        )
        right = service.add_oidc_identity(
            session,
            second,
            issuer="https://issuer-two.example",
            subject="same-subject",
            connection_id="second-login",
        )

        assert left.issuer != right.issuer
        assert (
            service.oidc_identity(session, issuer=left.issuer or "", subject=left.subject) == left
        )
        assert (
            service.oidc_identity(session, issuer=right.issuer or "", subject=right.subject)
            == right
        )

    def test_issuer_and_subject_are_database_unique(self, session: Session) -> None:
        first = make_account(session, "Erste Person")
        second = make_account(session, "Zweite Person")
        service.add_oidc_identity(
            session,
            first,
            issuer="https://identity.example",
            subject="unique-user",
            connection_id="main-oidc",
        )

        with pytest.raises(IntegrityError), session.begin_nested():
            service.add_oidc_identity(
                session,
                second,
                issuer="https://identity.example",
                subject="unique-user",
                connection_id="other-connection",
            )

    def test_pocket_id_is_a_normal_configured_connection(self, session: Session) -> None:
        account = make_account(session)
        identity = service.add_oidc_identity(
            session,
            account,
            issuer="https://pocket-id.home.example",
            subject="0198e59b-76b1-7a91-8a17-4e73c7b32844",
            connection_id="pocket-id",
        )

        assert identity.connection_id == "pocket-id"
        assert identity.provider == "OIDC"
        assert identity.secret_hash is None


class TestWebAuthnCredentials:
    def test_credential_metadata_is_preserved(self, session: Session) -> None:
        account = make_account(session)
        credential = service.store_webauthn_credential(
            session,
            account,
            credential_id=b"credential-id",
            public_key=b"cose-public-key",
            sign_count=7,
            transports=["internal", "hybrid"],
            name="Telefon",
            backup_eligible=True,
            backup_state=True,
        )

        assert service.webauthn_credential(session, b"credential-id") == credential
        assert credential.public_key == b"cose-public-key"
        assert credential.sign_count == 7
        assert credential.transports == ["internal", "hybrid"]
        assert credential.backup_eligible is True
        assert credential.backup_state is True

    def test_credential_id_is_database_unique(self, session: Session) -> None:
        first = make_account(session, "Erste Person")
        second = make_account(session, "Zweite Person")
        service.store_webauthn_credential(
            session,
            first,
            credential_id=b"globally-unique-credential",
            public_key=b"first-public-key",
        )

        with pytest.raises(IntegrityError), session.begin_nested():
            service.store_webauthn_credential(
                session,
                second,
                credential_id=b"globally-unique-credential",
                public_key=b"second-public-key",
            )


class TestActionTokens:
    def test_token_types_are_cryptographically_separate(self, session: Session) -> None:
        account = make_account(session)
        email = _email(session, account, "token-types@example.org")
        _, issued = action_tokens.issue_email_verification(session, email.id)

        with pytest.raises(ValidationError) as error:
            action_tokens.consume_magic_link(session, issued.token)
        assert error.value.code == action_tokens.ActionTokenErrorCode.INVALID

    @pytest.mark.parametrize(
        ("issue_name", "consume_name", "target_kind"),
        [
            ("issue_email_verification", "consume_email_verification", "email"),
            ("issue_magic_link", "consume_magic_link", "email"),
            ("issue_account_recovery", "consume_account_recovery", "account"),
        ],
    )
    def test_each_token_is_hashed_and_single_use(
        self,
        session: Session,
        caplog: pytest.LogCaptureFixture,
        issue_name: str,
        consume_name: str,
        target_kind: str,
    ) -> None:
        caplog.set_level(logging.DEBUG)
        account = make_account(session)
        email = _email(session, account, f"{issue_name}@example.org")
        target_id = email.id if target_kind == "email" else account.id
        issue = getattr(action_tokens, issue_name)
        consume = getattr(action_tokens, consume_name)

        model, issued = issue(session, target_id)
        assert issued.token not in str(model.__dict__)
        assert issued.token not in caplog.text

        assert consume(session, issued.token) == model
        assert model.consumed_at is not None
        with pytest.raises(ValidationError):
            consume(session, issued.token)

    def test_expired_token_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        email = _email(session, account, "expired@example.org")
        model, issued = action_tokens.issue_magic_link(session, email.id)
        model.expires_at = now() - timedelta(seconds=1)
        session.flush()

        with pytest.raises(ValidationError):
            action_tokens.consume_magic_link(session, issued.token)
        assert model.consumed_at is None

    def test_revoked_token_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        model, issued = action_tokens.issue_account_recovery(session, account.id)
        action_tokens.revoke(session, model)

        with pytest.raises(ValidationError):
            action_tokens.consume_account_recovery(session, issued.token)
        assert model.consumed_at is None
