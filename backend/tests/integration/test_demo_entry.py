"""Public demo persona selection stays isolated behind explicit demo mode."""

from __future__ import annotations

from datetime import date

import pytest

from eimir.api.v1 import demo as demo_api
from eimir.config import Environment, Settings
from eimir.demo.service import LEA_NAME, create_demo_space
from eimir.identity import service as identity_service
from eimir.identity.models import Account
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-entry-test-password"


def _seed(session, *, environment: Environment = Environment.TEST):  # type: ignore[no-untyped-def]
    return create_demo_space(
        session,
        environment=environment,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )


def test_demo_environment_can_create_canonical_seed(session) -> None:  # type: ignore[no-untyped-def]
    result = _seed(session, environment=Environment.DEMO)

    assert result.created is True


def test_demo_entry_is_hidden_when_demo_mode_is_disabled(
    client,
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    _seed(session)
    monkeypatch.setattr(demo_api, "get_settings", lambda: Settings())

    response = client.post("/api/v1/demo/entry", json={"persona": "LEA"})

    assert response.status_code == 404


def test_demo_entry_issues_one_time_proof_for_selected_persona(
    client,
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    _seed(session)
    monkeypatch.setattr(
        demo_api,
        "get_settings",
        lambda: Settings.model_validate({"demo_mode": True}),
    )

    entry = client.post("/api/v1/demo/entry", json={"persona": "LEA"})

    assert entry.status_code == 200
    assert entry.headers["cache-control"] == "no-store"
    token = entry.json()["token"]
    assert token

    consumed = client.post(
        "/api/v1/auth/magic-link/consume",
        json={"token": token, "deviceName": "Demo test", "platform": "web"},
    )
    assert consumed.status_code == 201
    assert consumed.json()["account"]["displayName"] == LEA_NAME

    repeated = client.post(
        "/api/v1/auth/magic-link/consume",
        json={"token": token, "deviceName": "Demo test", "platform": "web"},
    )
    assert repeated.status_code == 422


def test_demo_entry_still_succeeds_after_a_drifted_display_name(
    client,
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    """#633: a drifted display name alone must never hide the entry persona.

    An ordinary Demo visitor cannot cause this through the normal profile API
    (#697 already blocks that); this simulates legacy data or a direct
    database/operator edit instead. The entry endpoint used to require an
    exact display-name match, so any such pre-existing drift would lock the
    persona out of its own public entry point.
    """
    result = _seed(session)
    lea = session.get(Account, result.lea_id)
    assert lea is not None
    identity_service.update_display_name(session, lea, "Legacy-Datenstand")
    monkeypatch.setattr(
        demo_api,
        "get_settings",
        lambda: Settings.model_validate({"demo_mode": True}),
    )

    entry = client.post("/api/v1/demo/entry", json={"persona": "LEA"})

    assert entry.status_code == 200, entry.text


def test_demo_entry_reuses_normalized_network_rate_limit_key(
    client,
    session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    _seed(session)
    monkeypatch.setattr(
        demo_api,
        "get_settings",
        lambda: Settings.model_validate({"demo_mode": True}),
    )
    monkeypatch.setattr(
        demo_api.passkey_abuse,
        "network_key",
        lambda client_host: "normalized-demo-peer",
    )
    original_check = demo_api.rate_limit.check
    observed: dict[str, str] = {}

    def capture_check(session_arg, action, key, limit):  # type: ignore[no-untyped-def]
        if action == demo_api.DEMO_ENTRY_ACTION:
            observed["key"] = key
        return original_check(session_arg, action, key, limit)

    monkeypatch.setattr(demo_api.rate_limit, "check", capture_check)

    response = client.post("/api/v1/demo/entry", json={"persona": "LEA"})

    assert response.status_code == 200
    assert observed["key"] == "normalized-demo-peer:LEA"


def test_demo_entry_is_not_published_in_product_openapi(client) -> None:  # type: ignore[no-untyped-def]
    document = client.get("/openapi.json").json()

    assert "/api/v1/demo/entry" not in document["paths"]
