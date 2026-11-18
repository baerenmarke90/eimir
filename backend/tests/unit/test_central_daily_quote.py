import json
from datetime import UTC, date, datetime, timedelta
from hashlib import sha256
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from eimir.config import Settings
from eimir.quotes import central_client, central_service
from eimir.quotes.central_contract import DAILY_QUOTE_PATH

_TOKEN = "A" * 43
_AUTH = {"Authorization": f"Bearer {_TOKEN}"}
_ORIGIN = "https://quotes.example.com"


def _write_catalog(path: Path, *, duplicate: bool = False) -> None:
    catalog = {
        "entries": [
            {
                "id": f"mentria-{1 if duplicate else index:03d}",
                "collection": "mentria",
                "texts": {"de": f"Deutsch {index}", "en": f"English {index}"},
            }
            for index in (2, 1)
        ],
        "license": {"spdx": "Apache-2.0", "text": "License text"},
        "license_notice": "Test fixture",
    }
    (path / central_service.CATALOG_FILENAME).write_text(json.dumps(catalog), encoding="utf-8")


def test_service_authenticates_and_serves_only_the_current_bilingual_entry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_catalog(tmp_path)
    access_file = tmp_path / central_service.TOKEN_DIGESTS_FILENAME
    access_file.write_text(sha256(_TOKEN.encode("ascii")).hexdigest(), encoding="ascii")
    instant = datetime(2026, 11, 18, 23, 59, tzinfo=UTC)
    monkeypatch.setattr(central_service.clock, "now", lambda: instant)

    with TestClient(central_service.create_app(tmp_path)) as client:
        params = {"locale": "de"}
        assert client.get(DAILY_QUOTE_PATH, params=params).status_code == 401
        assert (
            client.get(
                DAILY_QUOTE_PATH, params=params, headers={"Authorization": "Bearer " + "B" * 43}
            ).status_code
            == 401
        )
        assert client.get("/openapi.json", headers=_AUTH).status_code == 404
        assert client.get("/v1/catalog", headers=_AUTH).status_code == 404
        assert (
            client.get(DAILY_QUOTE_PATH, params={"locale": "fr"}, headers=_AUTH).status_code == 422
        )

        de = client.get(DAILY_QUOTE_PATH, params=params, headers=_AUTH)
        en = client.get(
            DAILY_QUOTE_PATH,
            params={"locale": "en", "date": "2001-01-01"},
            headers=_AUTH,
        )
        assert de.status_code == en.status_code == 200
        assert de.headers["Cache-Control"] == "private, no-store"
        assert set(de.json()) == {"id", "checked_on", "locale", "text"}
        assert de.json()["id"] == en.json()["id"]
        assert de.json()["checked_on"] == en.json()["checked_on"] == "2026-11-18"
        assert de.json()["text"].startswith("Deutsch")
        assert en.json()["text"].startswith("English")

        instant += timedelta(minutes=1)
        following = client.get(DAILY_QUOTE_PATH, params=params, headers=_AUTH).json()
        assert following["checked_on"] == "2026-11-19"
        assert following["id"] != de.json()["id"]

    access_file.write_text("", encoding="ascii")
    with TestClient(central_service.create_app(tmp_path)) as client:
        assert client.get(DAILY_QUOTE_PATH, params=params, headers=_AUTH).status_code == 401


def test_service_requires_valid_private_catalog(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="could not be loaded"):
        central_service.create_app(tmp_path)
    _write_catalog(tmp_path, duplicate=True)
    with pytest.raises(RuntimeError, match="duplicate IDs"):
        central_service.create_app(tmp_path)


def test_client_uses_only_the_operator_request_and_caches_verified_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = date(2026, 11, 18)
    requests = []

    def serve(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert str(request.url) == f"{_ORIGIN}{DAILY_QUOTE_PATH}?locale=de"
        assert request.headers["Authorization"] == _AUTH["Authorization"]
        if len(requests) == 1:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "id": "mentria-001",
                "checked_on": day.isoformat(),
                "locale": "de",
                "text": "Mut.",
            },
        )

    transport = httpx.MockTransport(serve)
    real_client = httpx.Client
    monkeypatch.setattr(
        central_client.httpx, "Client", lambda **kwargs: real_client(transport=transport, **kwargs)
    )
    token = SecretStr(_TOKEN)
    assert central_client.get_quote(_ORIGIN, token, "de", day) is None
    quote = central_client.get_quote(_ORIGIN, token, "de", day)
    assert quote is not None
    assert quote.text == "Mut."
    assert quote.attribution_required
    assert "Apache-2.0" in (quote.source_display or "")
    assert central_client.get_quote(_ORIGIN, token, "de", day) == quote
    assert len(requests) == 2
    assert central_client.get_quote(_ORIGIN, token, "de", day + timedelta(days=1)) is None


def test_provider_settings_require_https_and_a_separate_token() -> None:
    assert not Settings().daily_quote_service_url
    with pytest.raises(ValidationError, match="HTTPS origin"):
        Settings(daily_quote_service_url="http://quotes.example.com")
    with pytest.raises(ValidationError, match="Configure both"):
        Settings(daily_quote_service_url=_ORIGIN)
    settings = Settings(
        daily_quote_service_url=_ORIGIN + "/", daily_quote_service_token=SecretStr(_TOKEN)
    )
    assert settings.daily_quote_service_url == _ORIGIN
    assert _TOKEN not in repr(settings)
