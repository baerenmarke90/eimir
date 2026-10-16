"""Integration tests for deployment-mode authentication enforcement (#710).

Verifies server-side authoritative rejection of disabled auth methods,
non-enumeration semantics on Cloud, restored database safety, and
capability projections across /instance/status and /auth/capabilities.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from eimir.auth import passwords
from eimir.config import Deployment, MailTransport, get_settings
from eimir.core.errors import ErrorCode
from eimir.db.session import get_session
from eimir.identity.models import Account, AccountEmail, AuthIdentity, AuthProvider
from eimir.mail import MailMessage, MailSender, sender
from eimir.main import create_app
from tests.conftest import TEST_BOOTSTRAP_TOKEN, auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

PASSWORD = "ein-sehr-sicheres-passwort-123"
EMAIL = "cloud-user@example.test"


class RecordingMailbox(MailSender):
    def __init__(self) -> None:
        self.messages: list[MailMessage] = []

    def send(self, message: MailMessage) -> None:
        self.messages.append(message)


@pytest.fixture
def mailbox() -> RecordingMailbox:
    return RecordingMailbox()


@pytest.fixture
def cloud_client(
    session: Session, mailbox: RecordingMailbox, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    settings = get_settings().model_copy(
        update={
            "deployment": Deployment.CLOUD,
            "mail_transport": MailTransport.SMTP,
            "oidc_connections": [],
        }
    )
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[sender] = lambda: mailbox
    from eimir.auth.policy import get_auth_capabilities, resolve_auth_capabilities

    app.dependency_overrides[get_auth_capabilities] = lambda: resolve_auth_capabilities(settings)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


@pytest.fixture
def self_hosted_client(
    session: Session, mailbox: RecordingMailbox, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    settings = get_settings().model_copy(
        update={
            "deployment": Deployment.SELF_HOSTED,
            "mail_transport": MailTransport.LOG,
            "oidc_connections": [],
        }
    )
    monkeypatch.setattr("eimir.config.get_settings", lambda: settings)

    app = create_app()
    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[sender] = lambda: mailbox
    from eimir.auth.policy import get_auth_capabilities, resolve_auth_capabilities

    app.dependency_overrides[get_auth_capabilities] = lambda: resolve_auth_capabilities(settings)
    with TestClient(app, raise_server_exceptions=False) as client:
        yield client


def _create_restored_local_account(session: Session, email_address: str, password: str) -> Account:
    """Simulate a database restored from a self-hosted instance with a local password identity."""
    account = make_account(session, "Restored User")

    email_record = AccountEmail(account_id=account.id, email=email_address, is_primary=True)
    session.add(email_record)
    session.flush()

    identity = AuthIdentity(
        account_id=account.id,
        provider=AuthProvider.LOCAL_PASSWORD.value,
        subject=email_address,
        secret_hash=passwords.hash_password(password),
    )
    session.add(identity)
    session.flush()
    return account


class TestCloudDeploymentAuthEnforcement:
    def test_cloud_rejects_password_registration_even_with_bootstrap_token(
        self, cloud_client: TestClient
    ) -> None:
        response = cloud_client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Cloud User",
                "email": EMAIL,
                "password": PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert response.status_code == 403
        data = response.json()
        assert data["code"] == ErrorCode.AUTH_METHOD_DISABLED

    def test_cloud_rejects_password_sign_in_without_account_enumeration(
        self, session: Session, cloud_client: TestClient
    ) -> None:
        # Create an existing account with local password
        _create_restored_local_account(session, EMAIL, PASSWORD)

        # 1. Sign in with existing email
        existing_res = cloud_client.post(
            "/api/v1/auth/sign-in",
            json={"email": EMAIL, "password": PASSWORD},
        )
        # 2. Sign in with non-existent email
        unknown_res = cloud_client.post(
            "/api/v1/auth/sign-in",
            json={"email": "nobody-exists@example.test", "password": PASSWORD},
        )

        assert existing_res.status_code == 403
        assert unknown_res.status_code == 403
        assert existing_res.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED
        assert unknown_res.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED
        # Both error responses must be identical
        assert existing_res.json() == unknown_res.json()

    def test_cloud_rejects_restored_local_identity(
        self, session: Session, cloud_client: TestClient
    ) -> None:
        """Restored/migrated accounts with AuthIdentity(provider="LOCAL")
        cannot use password auth on Cloud.
        """
        _create_restored_local_account(session, "migrated@example.test", PASSWORD)

        response = cloud_client.post(
            "/api/v1/auth/sign-in",
            json={"email": "migrated@example.test", "password": PASSWORD},
        )
        assert response.status_code == 403
        assert response.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED

    def test_cloud_rejects_password_recovery(self, cloud_client: TestClient) -> None:
        request_res = cloud_client.post(
            "/api/v1/auth/recovery/request",
            json={"email": EMAIL},
        )
        assert request_res.status_code == 403
        assert request_res.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED

        consume_res = cloud_client.post(
            "/api/v1/auth/recovery/consume",
            json={"token": "some-token", "newPassword": PASSWORD},
        )
        assert consume_res.status_code == 403
        assert consume_res.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED

    def test_cloud_rejects_change_password(
        self, session: Session, cloud_client: TestClient
    ) -> None:
        account = make_account(session, "Authed Cloud User")
        token = sign_in(session, account)
        session.flush()

        response = cloud_client.post(
            "/api/v1/auth/password",
            headers=auth(token),
            json={"currentPassword": PASSWORD, "newPassword": "new-password-123456"},
        )
        assert response.status_code == 403
        assert response.json()["code"] == ErrorCode.AUTH_METHOD_DISABLED

    def test_cloud_allows_magic_link_request(
        self, cloud_client: TestClient, mailbox: RecordingMailbox
    ) -> None:
        response = cloud_client.post(
            "/api/v1/auth/magic-link/request",
            json={"email": EMAIL},
        )
        assert response.status_code == 202

    def test_cloud_capability_projections(self, session: Session, cloud_client: TestClient) -> None:
        status_res = cloud_client.get("/api/v1/instance/status")
        assert status_res.status_code == 200
        assert status_res.json()["auth"] == {
            "localPassword": False,
            "passkey": True,
            "magicLink": True,
            "oidc": False,
        }

        account = make_account(session, "Authed Operator")
        token = sign_in(session, account)
        session.flush()

        cap_res = cloud_client.get("/api/v1/auth/capabilities", headers=auth(token))
        assert cap_res.status_code == 200
        assert cap_res.json()["auth"] == {
            "localPassword": False,
            "passkey": True,
            "magicLink": True,
            "oidc": False,
        }


class TestSelfHostedDeploymentAuthEnforcement:
    def test_self_hosted_allows_local_password_registration_and_sign_in(
        self, self_hosted_client: TestClient
    ) -> None:
        reg_res = self_hosted_client.post(
            "/api/v1/auth/register",
            json={
                "displayName": "Self Hosted User",
                "email": "sh-user@example.test",
                "password": PASSWORD,
                "bootstrapToken": TEST_BOOTSTRAP_TOKEN,
            },
        )
        assert reg_res.status_code == 201

        login_res = self_hosted_client.post(
            "/api/v1/auth/sign-in",
            json={"email": "sh-user@example.test", "password": PASSWORD},
        )
        assert login_res.status_code == 200

    def test_self_hosted_without_mail_transport_disables_magic_link(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        settings = get_settings().model_copy(
            update={
                "deployment": Deployment.SELF_HOSTED,
                "mail_transport": MailTransport.NONE,
                "oidc_connections": [],
            }
        )
        monkeypatch.setattr("eimir.config.get_settings", lambda: settings)

        app = create_app()
        app.dependency_overrides[get_session] = lambda: session
        from eimir.auth.policy import get_auth_capabilities, resolve_auth_capabilities

        app.dependency_overrides[get_auth_capabilities] = lambda: resolve_auth_capabilities(
            settings
        )

        with TestClient(app, raise_server_exceptions=False) as client:
            status_res = client.get("/api/v1/instance/status")
            assert status_res.status_code == 200
            assert status_res.json()["auth"]["magicLink"] is False
            assert status_res.json()["auth"]["localPassword"] is True

            magic_res = client.post(
                "/api/v1/auth/magic-link/request",
                json={"email": "any@example.test"},
            )
            assert magic_res.status_code == 503
            assert magic_res.json()["code"] == "MAIL_TRANSPORT_UNAVAILABLE"
