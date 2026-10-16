"""Android-specific OIDC recent-authentication redirect coverage."""

from __future__ import annotations

import httpx
import pytest
from sqlalchemy.orm import Session

from eimir import config
from eimir.auth import oidc, recent_auth
from eimir.config import MailTransport, OidcConnection, Settings
from tests.conftest import requires_database
from tests.integration import test_recent_authentication_oidc as base

pytestmark = [pytest.mark.integration, requires_database]

# Reuse the protocol fixtures from the provider-neutral OIDC integration suite.
signing_key = base.signing_key
provider_jwks = base.provider_jwks
provider = base.provider
account_context = base.account_context

ANDROID_REDIRECT = "de.sidebyside.app://recent-authentication/oidc"


def _settings(*, android_redirect_uri: str | None) -> Settings:
    return Settings(
        environment="test",  # type: ignore[arg-type]
        mail_transport=MailTransport.LOG,
        oidc_connections=[
            OidcConnection(
                id=base.CONNECTION,
                issuer=base.ISSUER,
                client_id=base.CLIENT_ID,
                client_secret=base.CLIENT_SECRET,  # type: ignore[arg-type]
                redirect_uri="https://app.example/recent-oidc",
                android_redirect_uri=android_redirect_uri,
            )
        ],
    )


def _install_settings(monkeypatch, settings: Settings) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(config, "get_settings", lambda: settings)
    monkeypatch.setattr(oidc, "get_settings", lambda: settings)
    monkeypatch.setattr(recent_auth, "get_settings", lambda: settings)


def test_android_start_uses_only_operator_configured_redirect(
    client,
    session: Session,
    provider: base.Provider,
    account_context,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    del provider
    _, headers, _ = account_context
    _install_settings(monkeypatch, _settings(android_redirect_uri=ANDROID_REDIRECT))

    response = client.post(f"{base.START}?client=android", headers=headers)
    assert response.status_code == 201, response.text

    body = response.json()
    parameters = dict(httpx.URL(body["authorizationUrl"]).params)
    assert parameters["redirect_uri"] == ANDROID_REDIRECT
    request = base._request(session, body["state"])
    assert request.redirect_uri == ANDROID_REDIRECT


def test_android_capabilities_and_start_fail_closed_without_mobile_redirect(
    client,
    provider: base.Provider,
    account_context,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    del provider
    _, headers, _ = account_context
    _install_settings(monkeypatch, _settings(android_redirect_uri=None))

    capabilities = client.get(
        "/api/v1/auth/recent-authentication/account-deletion?client=android",
        headers=headers,
    )
    assert capabilities.status_code == 200, capabilities.text
    assert base.CONNECTION not in capabilities.json()["oidcConnections"]

    start = client.post(f"{base.START}?client=android", headers=headers)
    assert start.status_code == 403
    assert start.json()["code"] == recent_auth.RecentAuthenticationErrorCode.METHOD_UNAVAILABLE


def test_web_capabilities_keep_existing_oidc_connection_without_mobile_redirect(
    client,
    provider: base.Provider,
    account_context,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    del provider
    _, headers, _ = account_context
    _install_settings(monkeypatch, _settings(android_redirect_uri=None))

    capabilities = client.get(
        "/api/v1/auth/recent-authentication/account-deletion",
        headers=headers,
    )
    assert capabilities.status_code == 200, capabilities.text
    assert base.CONNECTION in capabilities.json()["oidcConnections"]
