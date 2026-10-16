"""Secure transport boundaries in production."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from eimir.api.transport import _peer_is_loopback
from eimir.config import Environment, MailTransport, Settings
from eimir.main import create_app

CURSOR_SIGNING_KEY = "cursor-test-" + ("x" * 40)


def production_settings(**overrides: object) -> Settings:
    """Return a complete production configuration.

    Production requires several fields, including a real mail transport and
    an installation-specific cursor key. These tests exercise transport and
    must not fail on those requirements, but must not bypass them either.
    """
    values: dict[str, object] = {
        "environment": Environment.PRODUCTION,
        "allowed_hosts": ["app.example"],
        "mail_transport": MailTransport.SMTP,
        "public_base_url": "https://app.example",
        "cursor_signing_key": CURSOR_SIGNING_KEY,
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def production_client(
    monkeypatch: pytest.MonkeyPatch,
    base_url: str,
    allowed_hosts: list[str],
    *,
    peer_host: str = "127.0.0.1",
    trusted_proxy_hosts: list[str] | None = None,
) -> TestClient:
    monkeypatch.setattr(
        "eimir.main.get_settings",
        lambda: production_settings(allowed_hosts=allowed_hosts),
    )
    app = create_app()
    if trusted_proxy_hosts is not None:
        app = ProxyHeadersMiddleware(app, trusted_hosts=trusted_proxy_hosts)  # type: ignore[assignment]
    return TestClient(
        app,
        base_url=base_url,
        client=(peer_host, 50000),
        raise_server_exceptions=False,
    )


class TestAllowedHosts:
    def test_unknown_host_is_rejected(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = production_client(monkeypatch, "https://wrong.example", ["app.example"])
        assert client.get("/api/v1/health").status_code == 400

    def test_open_wildcard_is_forbidden_in_production(self) -> None:
        with pytest.raises(ValueError, match="EIMIR_ALLOWED_HOSTS"):
            production_settings(allowed_hosts=["*"])


class TestBootstrapConfiguration:
    def test_short_secret_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="EIMIR_BOOTSTRAP_TOKEN"):
            Settings(bootstrap_token="too-short")

    def test_secret_does_not_appear_in_settings_output(self) -> None:
        secret = "test-bootstrap-secret-with-at-least-32-characters"
        settings = Settings(bootstrap_token=secret)
        assert secret not in repr(settings)


class TestCursorConfiguration:
    def test_production_requires_cursor_signing_key(self) -> None:
        with pytest.raises(ValueError, match="EIMIR_CURSOR_SIGNING_KEY"):
            production_settings(cursor_signing_key=None)

    def test_short_cursor_signing_key_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="EIMIR_CURSOR_SIGNING_KEY"):
            Settings(cursor_signing_key="too-short")

    def test_cursor_signing_key_does_not_appear_in_settings_output(self) -> None:
        settings = Settings(cursor_signing_key=CURSOR_SIGNING_KEY)
        assert CURSOR_SIGNING_KEY not in repr(settings)


class TestHttpsBoundary:
    def test_ipv4_loopback_peer_may_use_plaintext(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = production_client(
            monkeypatch,
            "http://app.example",
            ["app.example"],
            peer_host="127.0.0.42",
        )
        assert client.get("/api/v1/health").status_code == 200

    def test_ipv6_loopback_peer_may_use_plaintext(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = production_client(
            monkeypatch,
            "http://app.example",
            ["app.example"],
            peer_host="::1",
        )
        assert client.get("/api/v1/health").status_code == 200

    @pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
    def test_loopback_host_text_cannot_exempt_external_peer(
        self,
        monkeypatch: pytest.MonkeyPatch,
        host: str,
    ) -> None:
        client = production_client(
            monkeypatch,
            f"http://{host}",
            [host],
            peer_host="192.0.2.10",
        )
        response = client.get("/api/v1/health")
        assert response.status_code == 400
        assert response.json()["code"] == "HTTPS_REQUIRED"

    def test_external_peer_requires_https(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = production_client(
            monkeypatch,
            "http://app.example",
            ["app.example"],
            peer_host="192.0.2.10",
        )
        response = client.get(
            "/api/v1/health",
            # A forwarded header has no authority unless the direct peer is in
            # Uvicorn's configured trusted-proxy set.
            headers={"X-Forwarded-Proto": "https"},
        )
        assert response.status_code == 400
        assert response.json()["code"] == "HTTPS_REQUIRED"

    def test_untrusted_proxy_headers_do_not_bypass_https(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = production_client(
            monkeypatch,
            "http://app.example",
            ["app.example"],
            peer_host="192.0.2.10",
            trusted_proxy_hosts=["192.0.2.44"],
        )
        response = client.get(
            "/api/v1/health",
            headers={
                "X-Forwarded-Proto": "https",
                "X-Forwarded-For": "203.0.113.25",
            },
        )
        assert response.status_code == 400
        assert response.json()["code"] == "HTTPS_REQUIRED"

    def test_trusted_remote_proxy_may_supply_https_scheme(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        client = production_client(
            monkeypatch,
            "http://app.example",
            ["app.example"],
            peer_host="192.0.2.44",
            trusted_proxy_hosts=["192.0.2.44"],
        )
        response = client.get(
            "/api/v1/health",
            headers={
                "X-Forwarded-Proto": "https",
                "X-Forwarded-For": "203.0.113.25",
            },
        )
        assert response.status_code == 200

    def test_external_https_peer_is_allowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = production_client(
            monkeypatch,
            "https://app.example",
            ["app.example"],
            peer_host="192.0.2.10",
        )
        assert client.get("/api/v1/health").status_code == 200

    def test_missing_or_non_ip_peer_is_not_loopback(self) -> None:
        assert _peer_is_loopback({"type": "http"}) is False  # type: ignore[arg-type]
        assert (
            _peer_is_loopback(
                {"type": "http", "client": ("not-an-ip", 50000)}  # type: ignore[arg-type]
            )
            is False
        )
