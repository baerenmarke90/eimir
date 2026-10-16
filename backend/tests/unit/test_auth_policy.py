"""Unit tests for deployment-mode authentication policy."""

from __future__ import annotations

import pytest
from pydantic import SecretStr

from eimir.auth.policy import AuthCapabilities, resolve_auth_capabilities
from eimir.config import Deployment, MailTransport, OidcConnection, Settings
from eimir.core.errors import AuthMethodDisabledError, ErrorCode


def _sample_oidc_connection() -> OidcConnection:
    return OidcConnection(
        id="test-provider",
        display_name="Test Provider",
        issuer="https://oidc.example.com",
        client_id="client-123",
        client_secret=SecretStr("secret-456"),
        redirect_uri="https://eimir.example.com/api/v1/auth/oidc/test-provider/callback",
    )


def test_resolve_capabilities_self_hosted_defaults() -> None:
    settings = Settings(
        deployment=Deployment.SELF_HOSTED,
        mail_transport=MailTransport.LOG,
        oidc_connections=[],
    )
    caps = resolve_auth_capabilities(settings)

    assert caps.local_password is True
    assert caps.passkey is True
    assert caps.magic_link is True
    assert caps.oidc is False


def test_resolve_capabilities_cloud_disables_local_password() -> None:
    settings = Settings(
        deployment=Deployment.CLOUD,
        mail_transport=MailTransport.SMTP,
        oidc_connections=[],
    )
    caps = resolve_auth_capabilities(settings)

    assert caps.local_password is False
    assert caps.passkey is True
    assert caps.magic_link is True
    assert caps.oidc is False


def test_resolve_capabilities_mail_transport_none_disables_magic_link() -> None:
    settings = Settings(
        deployment=Deployment.SELF_HOSTED,
        mail_transport=MailTransport.NONE,
        oidc_connections=[],
    )
    caps = resolve_auth_capabilities(settings)

    assert caps.magic_link is False


def test_resolve_capabilities_oidc_active_when_configured() -> None:
    settings = Settings(
        deployment=Deployment.CLOUD,
        mail_transport=MailTransport.SMTP,
        oidc_connections=[_sample_oidc_connection()],
    )
    caps = resolve_auth_capabilities(settings)

    assert caps.oidc is True


def test_auth_capabilities_serialization_keys() -> None:
    caps = AuthCapabilities(
        local_password=True,
        passkey=True,
        magic_link=False,
        oidc=True,
    )
    data = caps.model_dump(by_alias=True)
    assert data == {
        "localPassword": True,
        "passkey": True,
        "magicLink": False,
        "oidc": True,
    }


def test_ensure_local_password_allowed() -> None:
    allowed = AuthCapabilities(local_password=True, passkey=True, magic_link=True, oidc=False)
    allowed.ensure_local_password_allowed()

    disabled = AuthCapabilities(local_password=False, passkey=True, magic_link=True, oidc=False)
    with pytest.raises(AuthMethodDisabledError) as exc_info:
        disabled.ensure_local_password_allowed()

    assert exc_info.value.code == ErrorCode.AUTH_METHOD_DISABLED
    assert exc_info.value.status == 403


def test_ensure_passkey_allowed() -> None:
    allowed = AuthCapabilities(local_password=True, passkey=True, magic_link=True, oidc=False)
    allowed.ensure_passkey_allowed()

    disabled = AuthCapabilities(local_password=True, passkey=False, magic_link=True, oidc=False)
    with pytest.raises(AuthMethodDisabledError) as exc_info:
        disabled.ensure_passkey_allowed()

    assert exc_info.value.code == ErrorCode.AUTH_METHOD_DISABLED
    assert exc_info.value.status == 403


def test_ensure_magic_link_allowed() -> None:
    allowed = AuthCapabilities(local_password=True, passkey=True, magic_link=True, oidc=False)
    allowed.ensure_magic_link_allowed()

    disabled = AuthCapabilities(local_password=True, passkey=True, magic_link=False, oidc=False)
    with pytest.raises(AuthMethodDisabledError) as exc_info:
        disabled.ensure_magic_link_allowed()

    assert exc_info.value.code == ErrorCode.AUTH_METHOD_DISABLED
    assert exc_info.value.status == 403


def test_ensure_oidc_allowed() -> None:
    allowed = AuthCapabilities(local_password=True, passkey=True, magic_link=True, oidc=True)
    allowed.ensure_oidc_allowed()

    disabled = AuthCapabilities(local_password=True, passkey=True, magic_link=True, oidc=False)
    with pytest.raises(AuthMethodDisabledError) as exc_info:
        disabled.ensure_oidc_allowed()

    assert exc_info.value.code == ErrorCode.AUTH_METHOD_DISABLED
    assert exc_info.value.status == 403
