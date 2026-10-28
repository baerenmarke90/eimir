"""Synthetic browser-cookie separation without enabling application import."""

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from eimir.api import deps
from eimir.api.v1 import photo_sources as api
from eimir.auth.tokens import generate_token, hash_token
from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.core.errors import ServiceUnavailableError
from eimir.db.session import get_session
from eimir.photo_sources import browser_binding, service
from eimir.photo_sources.models import PhotoSelection, PhotoSelectionPayload
from eimir.providers.photo_transport import PhotoSourceError


@pytest.fixture
def flow(monkeypatch):
    # Only this synthetic test seam opens the gate; configuration cannot do so.
    monkeypatch.setattr(service, "google_import_available", lambda: True)
    monkeypatch.setattr(service, "enabled", lambda: True)
    monkeypatch.setattr(service, "_guard", Mock())
    monkeypatch.setattr(service, "ensure_capability", Mock())
    monkeypatch.setattr(service, "require_membership", Mock())
    monkeypatch.setattr(service, "lock_subject", Mock())
    monkeypatch.setattr(service.rate_limit, "check", Mock())
    monkeypatch.setattr(service.queue, "enqueue", Mock())
    account = SimpleNamespace(id=uuid4(), is_active=True)
    device = SimpleNamespace(
        id=uuid4(),
        account_id=account.id,
        revoked_at=None,
        expires_at=now() + timedelta(days=1),
        absolute_expires_at=now() + timedelta(days=2),
    )
    authorization = AuthorizationContext(account_id=account.id, space_id=uuid4())
    state = generate_token()
    monkeypatch.setattr(
        service.google_photos,
        "authorization",
        Mock(return_value=("https://accounts.google.com/synthetic", state, "verifier")),
    )
    exchange = Mock(return_value="synthetic-access-token")
    picker = Mock()
    picker.create.return_value = {
        "id": "synthetic-picker",
        "pickerUri": "https://photos.google.com/synthetic",
    }
    monkeypatch.setattr(service.google_photos, "exchange", exchange)
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Mock(return_value=picker))
    session = Mock()
    session.scalar.return_value = 0
    session.get.side_effect = lambda model, identifier: (
        account if model is service.Account else device
    )
    return SimpleNamespace(
        account=account,
        device=device,
        authorization=authorization,
        state=state,
        session=session,
        exchange=exchange,
        picker=picker,
    )


def start(flow):
    proof = generate_token()
    row, url = service.start(
        flow.session, flow.authorization, flow.device, "google", 2, browser_binding=proof
    )
    metadata = SimpleNamespace(
        id=row.id,
        account_id=row.account_id,
        space_id=row.space_id,
        device_session_id=row.device_session_id,
    )
    flow.session.execute.return_value.first.return_value = metadata
    flow.session.execute.return_value.scalar_one_or_none.return_value = row
    return proof, row, url


@pytest.mark.parametrize("proof", [None, "", "short", "x" * 1024, "x" * 42 + ";"])
def test_start_requires_an_independent_well_formed_proof(flow, proof):
    with pytest.raises(ServiceUnavailableError):
        service.start(
            flow.session, flow.authorization, flow.device, "google", 2, browser_binding=proof
        )
    service.google_photos.authorization.assert_not_called()
    flow.session.add.assert_not_called()


def test_start_persists_only_the_hash_in_the_protected_payload(flow):
    proof, row, url = start(flow)
    assert row.payload.browser_binding_hash == hash_token(proof)
    assert row.payload.oauth_state == flow.state
    assert proof not in row.payload.model_dump_json()
    assert proof not in repr(row.payload)
    assert proof not in url
    assert flow.state != proof


@pytest.mark.parametrize("wrong", [None, "", "invalid", "A" * 43])
def test_other_browser_cannot_exchange_or_consume_the_initiating_task(flow, wrong):
    _, row, _ = start(flow)
    before = row.payload.model_dump()
    assert service.callback(flow.session, flow.state, "code", browser_binding=wrong) is None
    flow.exchange.assert_not_called()
    flow.picker.create.assert_not_called()
    assert row.state_hash == hash_token(flow.state)
    assert row.status == "AUTHORIZING"
    assert row.payload.model_dump() == before


def test_legacy_task_without_browser_hash_fails_closed(flow):
    proof, row, _ = start(flow)
    row.payload = row.payload.model_copy(update={"browser_binding_hash": None})
    assert service.callback(flow.session, flow.state, "code", browser_binding=proof) is None
    flow.exchange.assert_not_called()
    assert row.status == "AUTHORIZING"


def test_correct_browser_exchanges_and_erases_one_use_proofs(flow):
    proof, row, _ = start(flow)
    assert service.callback(flow.session, flow.state, "code", browser_binding=proof) == (
        "https://photos.google.com/synthetic"
    )
    flow.exchange.assert_called_once_with("code", flow.state, "verifier")
    assert row.status == "PICKING"
    assert row.state_hash is None
    assert row.payload.browser_binding_hash is None
    assert row.payload.oauth_state is None
    assert row.payload.code_verifier is None


@pytest.mark.parametrize("failure", ["denied", "exchange", "picker"])
def test_valid_browser_denial_or_provider_failure_consumes_and_erases_proofs(flow, failure):
    proof, row, _ = start(flow)
    if failure == "exchange":
        flow.exchange.side_effect = PhotoSourceError("PHOTO_SOURCE_AUTHORIZATION_FAILED")
    elif failure == "picker":
        flow.picker.create.side_effect = PhotoSourceError("PHOTO_SOURCE_UNAVAILABLE")
    code = None if failure == "denied" else "synthetic-code"
    assert service.callback(flow.session, flow.state, code, browser_binding=proof) is None
    assert row.status == "FAILED"
    assert row.state_hash is None
    for field in ("browser_binding_hash", "oauth_state", "code_verifier", "access_token"):
        assert getattr(row.payload, field) is None


@pytest.mark.parametrize("invalid", ["revoked", "expired", "absolute", "foreign", "inactive"])
def test_browser_proof_does_not_replace_current_account_and_device_authority(flow, invalid):
    proof, _, _ = start(flow)
    if invalid == "revoked":
        flow.device.revoked_at = now()
    elif invalid == "expired":
        flow.device.expires_at = now() - timedelta(seconds=1)
    elif invalid == "absolute":
        flow.device.absolute_expires_at = now() - timedelta(seconds=1)
    elif invalid == "foreign":
        flow.device.account_id = uuid4()
    else:
        flow.account.is_active = False
    assert service.callback(flow.session, flow.state, "code", browser_binding=proof) is None
    flow.exchange.assert_not_called()


def test_two_http_browser_jars_cannot_complete_each_others_selection(flow):
    app = FastAPI()
    app.include_router(api.router, prefix="/api/v1")
    app.dependency_overrides[get_session] = lambda: flow.session
    app.dependency_overrides[deps.authorization_context] = lambda: flow.authorization
    app.dependency_overrides[deps.current_session] = lambda: flow.device
    with (
        TestClient(app, base_url="https://eimir.example") as initiating,
        TestClient(app, base_url="https://eimir.example") as other,
    ):
        response = initiating.post(
            f"/api/v1/spaces/{flow.authorization.space_id}/photo-selections",
            json={"source": "google", "maxItems": 2, "consent": True},
        )
        assert response.status_code == 201
        row = flow.session.add.call_args.args[0]
        flow.session.execute.return_value.first.return_value = SimpleNamespace(
            id=row.id,
            account_id=row.account_id,
            space_id=row.space_id,
            device_session_id=row.device_session_id,
        )
        flow.session.execute.return_value.scalar_one_or_none.return_value = row
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "Secure" in cookie and "SameSite=lax" in cookie
        assert "Max-Age=600" in cookie and "Path=/" in cookie and "Domain=" not in cookie
        name = browser_binding.cookie_name(flow.state)
        proof = initiating.cookies.get(name)
        assert (
            proof
            and proof not in response.text
            and proof not in response.headers.get("location", "")
        )
        callback = "/api/v1/photo-sources/google/callback"
        parameters = {"state": flow.state, "code": "synthetic-code"}
        wrong = other.get(callback, params=parameters, follow_redirects=False)
        assert wrong.status_code == 200 and "Location" not in wrong.headers
        flow.exchange.assert_not_called()
        assert row.status == "AUTHORIZING"
        correct = initiating.get(callback, params=parameters, follow_redirects=False)
        assert correct.status_code == 303
        flow.exchange.assert_called_once()
        assert initiating.cookies.get(name) is None
        assert correct.headers["Cache-Control"] == "private, no-store"
        assert correct.headers["Referrer-Policy"] == "no-referrer"


def test_payload_default_does_not_upgrade_a_legacy_task_into_a_bound_one():
    payload = PhotoSelectionPayload(
        selection_id=uuid4(), account_id=uuid4(), space_id=uuid4(), device_session_id=uuid4()
    )
    assert payload.browser_binding_hash is None
    assert PhotoSelection(provider="immich", payload=payload).payload.browser_binding_hash is None
