"""Operational health information and app construction."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from eimir.config import Environment, MailTransport, Settings
from eimir.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app(), raise_server_exceptions=False)


class TestHealth:
    def test_liveness_does_not_require_database(self, client: TestClient) -> None:
        """Liveness must not fail merely because the database is unavailable."""
        response = client.get("/api/v1/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        assert response.headers["X-Eimir-Revision"] == "unverified-local-checkout"
        assert response.headers["X-SideBySide-Revision"] == "unverified-local-checkout"

    def test_revision_header_uses_build_identity(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("EIMIR_BUILD_REVISION", "0123456789abcdef")
        response = client.get("/api/v1/health")
        assert response.headers["X-Eimir-Revision"] == "0123456789abcdef"

    def test_legacy_revision_environment_alias_is_accepted(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("EIMIR_BUILD_REVISION", raising=False)
        monkeypatch.setenv("SBS_BUILD_REVISION", "legacy-build-revision")

        response = client.get("/api/v1/health")

        assert response.headers["X-Eimir-Revision"] == "legacy-build-revision"
        assert response.headers["X-SideBySide-Revision"] == "legacy-build-revision"

    def test_revision_header_rejects_newlines(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("EIMIR_BUILD_REVISION", "main\r\nX-Injected: yes")
        response = client.get("/api/v1/health")
        assert response.headers["X-Eimir-Revision"] == "unknown"
        assert "X-Injected" not in response.headers

    def test_readiness_reports_503_without_database(self, client: TestClient) -> None:
        response = client.get("/api/v1/health/ready")
        assert response.status_code in (200, 503)
        assert response.headers["X-Eimir-Revision"] == "unverified-local-checkout"
        if response.status_code == 503:
            assert response.json()["database"] == "unavailable"

    def test_readiness_does_not_leak_connection_details(self, client: TestClient) -> None:
        """A connection error can contain host, port, and username."""
        raw_text = client.get("/api/v1/health/ready").text
        for forbidden in ("postgresql", "psycopg", "localhost", "5432", "Traceback"):
            assert forbidden not in raw_text


class TestApiContract:
    def test_everything_is_under_api_v1(self, client: TestClient) -> None:
        """The version is in the path so older installations can survive future breaking changes."""
        paths = list(client.get("/openapi.json").json()["paths"])
        assert paths
        assert all(path.startswith("/api/v1/") for path in paths), paths

    def test_openapi_is_reachable(self, client: TestClient) -> None:
        response = client.get("/openapi.json")
        assert response.status_code == 200
        assert "/api/v1/health" in response.json()["paths"]


class TestProduction:
    def test_schema_is_closed_in_production(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An exposed schema is a map of the attack surface."""
        monkeypatch.setattr(
            "eimir.main.get_settings",
            lambda: Settings(
                environment=Environment.PRODUCTION,
                mail_transport=MailTransport.SMTP,
                public_base_url="https://app.example",
                cursor_signing_key="cursor-test-" + ("x" * 40),
            ),
        )
        production = TestClient(
            create_app(),
            base_url="http://localhost",
            client=("127.0.0.1", 50000),
            raise_server_exceptions=False,
        )
        assert production.get("/openapi.json").status_code == 404
        assert production.get("/docs").status_code == 404
