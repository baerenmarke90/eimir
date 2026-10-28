"""Real authentication, tenant/device ownership, Pro and credential lifecycle."""

from datetime import timedelta
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select, text

from eimir.auth.sessions import resolve
from eimir.auth.tokens import hash_token
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.photo_sources import service
from eimir.photo_sources.models import (
    PhotoConnection,
    PhotoSelection,
    PhotoSelectionPayload,
    SelectedPhotoItem,
)
from eimir.providers.immich_photos import SelectedPhoto
from eimir.relationship.service import add_member
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
EXTERNAL_ACCOUNT = UUID("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")


class ImmichFixture:
    def __init__(self, origin, key):
        assert origin == "https://my-photos.example"
        assert key.get_secret_value() == "synthetic-private-key"

    def account_id(self):
        return EXTERNAL_ACCOUNT

    def list_photos(self, owner, page):
        assert owner == str(EXTERNAL_ACCOUNT)
        return [("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "image/jpeg")], None

    def read_selected_photo(self, selected, *, expected_owner):
        assert expected_owner == str(EXTERNAL_ACCOUNT)
        assert selected == "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        return SelectedPhoto(b"selected-photo", "image/jpeg", "imported-photo.jpg")


@pytest.fixture(autouse=True)
def configured(encryption, monkeypatch):
    encryption.apply("required")
    monkeypatch.setenv("EIMIR_PHOTO_SOURCES_ENABLED", "true")
    monkeypatch.setenv("EIMIR_PUBLIC_BASE_URL", "https://eimir.example")
    get_settings.cache_clear()
    monkeypatch.setattr(service, "ImmichSelectedPhotoReader", ImmichFixture)
    yield
    get_settings.cache_clear()


@pytest.fixture
def owners(session):
    anna, ben, outsider = [make_account(session, name) for name in ("Anna", "Ben", "Outsider")]
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    other = make_space(session, anna)
    return {
        "anna": anna,
        "space": space,
        "other": other,
        "a": auth(sign_in(session, anna)),
        "second": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
        "out": auth(sign_in(session, outsider)),
    }


def grant(session, owners):
    return entitlements.record_grant(
        session,
        space_id=owners["space"].id,
        account_id=owners["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        effective_from=now(),
        capabilities=[Capability.INTEGRATION_EXTERNAL_SYNC.value],
    )


def path(owners):
    return f"/api/v1/spaces/{owners['space'].id}"


def link(client, owners):
    return client.put(
        path(owners) + "/photo-sources/immich",
        headers={
            **owners["a"],
            "If-Match": client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
                "immichConnectionToken"
            ],
        },
        json={
            "origin": "https://my-photos.example",
            "apiKey": "synthetic-private-key",
            "consent": True,
        },
    )


def begin(client, owners):
    response = client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={"source": "immich", "maxItems": 2, "consent": True},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_link_is_pro_encrypted_and_not_shared_with_partner(client, session, owners):
    assert link(client, owners).status_code == 403
    grant(session, owners)
    assert link(client, owners).status_code == 204
    own = client.get(path(owners) + "/photo-sources", headers=owners["a"])
    assert own.json()["immichOrigin"] == "https://my-photos.example"
    assert own.headers["Cache-Control"] == "private, no-store"
    assert (
        client.get(path(owners) + "/photo-sources", headers=owners["b"]).json()["immichConnected"]
        is False
    )
    raw = session.execute(text("SELECT payload FROM photo_source_connections")).scalar_one()
    assert raw["_enc"] == 2
    assert "synthetic-private-key" not in str(raw)
    assert "my-photos.example" not in str(raw)


def test_selection_is_bound_to_device_account_and_space_before_transfer(client, session, owners):
    grant(session, owners)
    assert link(client, owners).status_code == 204
    selection = begin(client, owners)
    target = path(owners) + f"/photo-selections/{selection['id']}"
    for headers in [owners["b"], owners["second"], owners["out"]]:
        assert client.post(target + "/poll", headers=headers).status_code == 404
    assert client.post(target + "/poll").status_code == 401
    foreign = f"/api/v1/spaces/{owners['other'].id}/photo-selections/{selection['id']}/poll"
    assert client.post(foreign, headers=owners["a"]).status_code == 403
    item = selection["items"][0]["id"]
    assert "aaaaaaaa-aaaa" not in str(selection)
    assert "synthetic-private-key" not in str(selection)
    assert client.post(target + "/items/unselected", headers=owners["a"]).status_code == 404
    photo = client.post(target + "/items/" + item, headers=owners["a"])
    assert photo.content == b"selected-photo"
    assert photo.headers["Cache-Control"] == "private, no-store"
    assert client.delete(target, headers=owners["a"]).status_code == 204
    assert session.scalar(select(PhotoSelection)) is None


def test_downgrade_blocks_new_work_but_disconnect_erases_credentials_and_selection(
    client, session, owners
):
    entitlement = grant(session, owners)
    assert link(client, owners).status_code == 204
    selection = begin(client, owners)
    entitlements.revoke_grant(session, entitlement.id)
    assert link(client, owners).status_code == 403
    assert (
        client.post(
            path(owners) + f"/photo-selections/{selection['id']}/poll", headers=owners["a"]
        ).status_code
        == 403
    )
    assert (
        client.delete(
            path(owners) + "/photo-sources/immich",
            headers={
                **owners["a"],
                "If-Match": client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
                    "immichConnectionToken"
                ],
            },
        ).status_code
        == 204
    )
    session.expire_all()
    assert session.scalar(select(PhotoConnection)) is None
    assert session.scalar(select(PhotoSelection)) is None


def test_expiry_fails_closed_and_job_erases_the_provider_payload(client, session, owners):
    grant(session, owners)
    assert link(client, owners).status_code == 204
    selected = begin(client, owners)
    row = session.get(PhotoSelection, UUID(selected["id"]))
    row.expires_at = now() - timedelta(seconds=1)
    session.flush()
    assert (
        client.post(
            path(owners) + f"/photo-selections/{row.id}/poll", headers=owners["a"]
        ).status_code
        == 404
    )
    service.expire(session, {"selection_id": selected["id"]})
    assert session.scalar(select(PhotoSelection)) is None


@pytest.mark.parametrize("feature_enabled", [True, False])
def test_google_security_gate_refuses_new_imports_despite_operator_configuration(
    client, session, owners, monkeypatch, feature_enabled
):
    grant(session, owners)
    monkeypatch.setenv("EIMIR_PHOTO_SOURCES_ENABLED", str(feature_enabled).lower())
    monkeypatch.setenv("EIMIR_GOOGLE_PHOTOS_CLIENT_ID", "synthetic-client-id")
    monkeypatch.setenv("EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET", "synthetic-client-secret")
    get_settings.cache_clear()
    authorization = Mock()
    monkeypatch.setattr(service.google_photos, "authorization", authorization)
    availability = client.get(path(owners) + "/photo-sources", headers=owners["a"])
    assert availability.status_code == 200
    assert availability.json()["enabled"] is feature_enabled
    assert availability.json()["googleAvailable"] is False
    assert availability.json()["canImport"] is True
    selection = client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={"source": "google", "maxItems": 2, "consent": True},
    )
    assert selection.status_code == 503
    authorization.assert_not_called()
    assert session.scalar(select(PhotoSelection)) is None


def legacy_google_selection(session, owners, status="READY"):
    token = owners["a"]["Authorization"].removeprefix("Bearer ")
    device, _ = resolve(session, token)
    identifier = uuid4()
    authorizing = status == "AUTHORIZING"
    row = PhotoSelection(
        id=identifier,
        account_id=owners["anna"].id,
        space_id=owners["space"].id,
        device_session_id=device.id,
        provider="google",
        status=status,
        state_hash=hash_token("private-state") if authorizing else None,
        expires_at=now() + timedelta(minutes=10),
        next_poll_at=now(),
        payload=PhotoSelectionPayload(
            selection_id=identifier,
            account_id=owners["anna"].id,
            space_id=owners["space"].id,
            device_session_id=device.id,
            oauth_state="private-state" if authorizing else None,
            code_verifier="private-verifier" if authorizing else None,
            access_token=None if authorizing else "synthetic-google-token",
            provider_session_id=None if authorizing else "private-picker",
            items=[
                SelectedPhotoItem(
                    id="selected-local-item",
                    source_id="synthetic-provider-item",
                    mime_type="image/jpeg",
                    source_url="https://lh3.googleusercontent.com/synthetic",
                )
            ],
        ),
    )
    session.add(row)
    session.flush()
    return row


def test_google_gate_rejects_legacy_callback_poll_and_read_without_provider_access(
    client, session, owners, monkeypatch
):
    grant(session, owners)
    pending = legacy_google_selection(session, owners, "AUTHORIZING")
    ready = legacy_google_selection(session, owners)
    exchange = Mock()
    picker = Mock()
    monkeypatch.setattr(service.google_photos, "exchange", exchange)
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", picker)
    callback = "/api/v1/photo-sources/google/callback?state=private-state&code=one-use-code"
    response = client.get(callback, follow_redirects=False)
    assert response.status_code == 200
    assert "Location" not in response.headers
    assert client.get(callback, follow_redirects=False).status_code == 200
    for row in (pending, ready):
        target = path(owners) + f"/photo-selections/{row.id}"
        assert client.post(target + "/poll", headers=owners["a"]).status_code == 503
        assert (
            client.post(target + "/items/selected-local-item", headers=owners["a"]).status_code
            == 503
        )
    exchange.assert_not_called()
    picker.assert_not_called()
    assert pending.status == "AUTHORIZING"


@pytest.mark.parametrize("cleanup", ["cancel", "expiry", "revocation"])
def test_google_gate_preserves_legacy_cleanup_after_disable_and_downgrade(
    client, session, owners, monkeypatch, cleanup
):
    from eimir.identity.models import DeviceSession
    from eimir.photo_sources.retention import cleanup as periodic_cleanup

    entitlement = grant(session, owners)
    row = legacy_google_selection(session, owners)
    picker = Mock()
    constructor = Mock(return_value=picker)
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", constructor)
    entitlements.revoke_grant(session, entitlement.id)
    monkeypatch.setenv("EIMIR_PHOTO_SOURCES_ENABLED", "false")
    get_settings.cache_clear()
    if cleanup == "cancel":
        assert (
            client.delete(
                path(owners) + f"/photo-selections/{row.id}", headers=owners["a"]
            ).status_code
            == 204
        )
    elif cleanup == "expiry":
        row.expires_at = now() - timedelta(seconds=1)
        session.flush()
        service.expire(session, {"selection_id": str(row.id)})
    else:
        session.get(DeviceSession, row.device_session_id).revoked_at = now()
        session.flush()
        periodic_cleanup(session, {})
    constructor.assert_called_once_with("synthetic-google-token")
    picker.delete.assert_called_once_with("private-picker")
    assert session.scalar(select(PhotoSelection).where(PhotoSelection.id == row.id)) is None


def test_stale_disconnect_cannot_erase_a_replaced_or_recreated_link(client, session, owners):
    grant(session, owners)
    assert link(client, owners).status_code == 204
    endpoint = path(owners) + "/photo-sources/immich"
    stale = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
        "immichConnectionToken"
    ]
    assert link(client, owners).status_code == 204
    assert client.delete(endpoint, headers={**owners["a"], "If-Match": stale}).status_code == 409
    current = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
        "immichConnectionToken"
    ]
    assert client.delete(endpoint, headers={**owners["a"], "If-Match": current}).status_code == 204
    assert link(client, owners).status_code == 204
    assert client.delete(endpoint, headers={**owners["a"], "If-Match": stale}).status_code == 409
    available = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert available["immichConnected"]


def test_personal_export_excludes_credentials_and_account_deletion_purges_link(
    client, session, owners
):
    import json
    from zipfile import ZipFile

    from eimir.authorization import AuthorizationContext
    from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
    from eimir.transfer.models import TransferScope
    from eimir.transfer.service import build_export_archive

    grant(session, owners)
    assert link(client, owners).status_code == 204
    begin(client, owners)
    context = AuthorizationContext(account_id=owners["anna"].id, space_id=owners["space"].id)
    for scope in (TransferScope.PERSONAL, TransferScope.SHARED):
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            document = json.loads(archive.read("accounts.json"))
            if scope is TransferScope.PERSONAL:
                assert document["personalPhotoSources"] == [
                    {"source": "immich", "origin": "https://my-photos.example"}
                ]
            else:
                assert "personalPhotoSources" not in document
            assert all(
                b"synthetic-private-key" not in archive.read(name) for name in archive.namelist()
            )
    apply_accepted_tombstone(session, owners["anna"].id, accepted_at=now())
    apply_core_cleanup(session, owners["anna"].id)
    session.expire_all()
    assert session.scalar(select(PhotoConnection)) is None
    assert session.scalar(select(PhotoSelection)) is None


def test_periodic_cleanup_recovers_lost_expiry_jobs_and_revoked_sessions(client, session, owners):
    from eimir.identity.models import DeviceSession
    from eimir.photo_sources.retention import cleanup

    grant(session, owners)
    assert link(client, owners).status_code == 204
    selected = begin(client, owners)
    row = session.get(PhotoSelection, UUID(selected["id"]))
    device = session.get(DeviceSession, row.device_session_id)
    device.revoked_at = now()
    session.flush()
    cleanup(session, {})
    assert session.scalar(select(PhotoSelection)) is None
    assert session.scalar(select(PhotoConnection)) is not None


def test_missing_match_headers_cannot_replace_or_disconnect_link(client, session, owners):
    grant(session, owners)
    assert link(client, owners).status_code == 204
    endpoint = path(owners) + "/photo-sources/immich"
    before = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert (
        client.put(
            endpoint,
            headers=owners["a"],
            json={
                "origin": "https://my-photos.example",
                "apiKey": "synthetic-private-key",
                "consent": True,
            },
        ).status_code
        == 422
    )
    assert client.delete(endpoint, headers=owners["a"]).status_code == 422
    after = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert after == before
    assert after["immichConnected"] is True


@pytest.fixture
def synthetic_google(monkeypatch):
    from eimir.auth.tokens import generate_token

    # Deliberately test the future binding behind the unchanged literal gate.
    # No production setting or test application configuration enables Google.
    monkeypatch.setattr(service, "google_import_available", lambda: True)
    states = []

    def authorization():
        state = generate_token()
        states.append(state)
        return "https://accounts.google.com/synthetic", state, "synthetic-verifier"

    monkeypatch.setattr(service.google_photos, "authorization", authorization)
    exchange = Mock(return_value="synthetic-google-token")
    monkeypatch.setattr(service.google_photos, "exchange", exchange)
    picker = Mock()
    picker.create.return_value = {
        "id": "synthetic-picker",
        "pickerUri": "https://photos.google.com/synthetic",
    }
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Mock(return_value=picker))
    return states, exchange, picker


def begin_google(browser, owners):
    response = browser.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={"source": "google", "maxItems": 2, "consent": True},
    )
    assert response.status_code == 201, response.text
    return UUID(response.json()["id"])


def google_callback(browser, state, code="synthetic-code"):
    return browser.get(
        "/api/v1/photo-sources/google/callback",
        params={"state": state, **({"code": code} if code else {})},
        follow_redirects=False,
    )


def test_google_callback_requires_the_initiating_browser_and_consumes_once(
    client, session, owners, synthetic_google
):
    from fastapi.testclient import TestClient

    from eimir.photo_sources.browser_binding import cookie_name

    states, exchange, _ = synthetic_google
    grant(session, owners)
    with (
        TestClient(client.app, base_url="https://eimir.example") as initiating,
        TestClient(client.app, base_url="https://eimir.example") as other,
    ):
        identifier = begin_google(initiating, owners)
        state = states[0]
        proof = initiating.cookies.get(cookie_name(state))
        row = session.get(PhotoSelection, identifier)
        assert row.payload.browser_binding_hash == hash_token(proof)
        raw = session.execute(
            text("SELECT payload FROM photo_source_selections WHERE id = :id"),
            {"id": identifier},
        ).scalar_one()
        assert raw["_enc"] == 2
        assert proof not in str(raw) and hash_token(proof) not in str(raw)
        # Even the same Account bearer in another cookie jar cannot complete it.
        other.headers.update(owners["a"])
        denied = google_callback(other, state)
        assert denied.status_code == 200 and "Location" not in denied.headers
        exchange.assert_not_called()
        session.refresh(row)
        assert row.status == "AUTHORIZING" and row.state_hash == hash_token(state)
        accepted = google_callback(initiating, state)
        assert accepted.status_code == 303
        exchange.assert_called_once_with("synthetic-code", state, "synthetic-verifier")
        assert initiating.cookies.get(cookie_name(state)) is None
        session.refresh(row)
        assert row.status == "PICKING" and row.state_hash is None
        assert row.payload.browser_binding_hash is None
        # Restoring the old cookie cannot restore the consumed transaction.
        initiating.cookies.set(cookie_name(state), proof, domain="eimir.example", path="/")
        assert google_callback(initiating, state).status_code == 200
        exchange.assert_called_once()


def test_two_google_transactions_have_independent_browser_proofs(
    client, session, owners, synthetic_google
):
    from fastapi.testclient import TestClient

    from eimir.photo_sources.browser_binding import cookie_name

    states, exchange, _ = synthetic_google
    grant(session, owners)
    with TestClient(client.app, base_url="https://eimir.example") as browser:
        begin_google(browser, owners)
        begin_google(browser, owners)
        assert cookie_name(states[0]) != cookie_name(states[1])
        assert browser.cookies.get(cookie_name(states[0])) != browser.cookies.get(
            cookie_name(states[1])
        )
        assert google_callback(browser, states[1]).status_code == 303
        assert browser.cookies.get(cookie_name(states[0])) is not None
        assert google_callback(browser, states[0]).status_code == 303
        assert exchange.call_count == 2


@pytest.mark.parametrize(
    "condition", ["wrong-proof", "legacy", "expired", "revoked", "downgraded", "disabled"]
)
def test_google_browser_proof_does_not_bypass_lifecycle_checks(
    client, session, owners, synthetic_google, monkeypatch, condition
):
    from fastapi.testclient import TestClient

    from eimir.identity.models import DeviceSession
    from eimir.photo_sources.browser_binding import cookie_name

    states, exchange, _ = synthetic_google
    entitlement = grant(session, owners)
    with TestClient(client.app, base_url="https://eimir.example") as browser:
        identifier = begin_google(browser, owners)
        row = session.get(PhotoSelection, identifier)
        if condition == "wrong-proof":
            browser.cookies.set(cookie_name(states[0]), "A" * 43, domain="eimir.example", path="/")
        elif condition == "legacy":
            row.payload = row.payload.model_copy(update={"browser_binding_hash": None})
        elif condition == "expired":
            row.expires_at = now() - timedelta(seconds=1)
        elif condition == "revoked":
            session.get(DeviceSession, row.device_session_id).revoked_at = now()
        elif condition == "downgraded":
            entitlements.revoke_grant(session, entitlement.id)
        else:
            monkeypatch.setenv("EIMIR_PHOTO_SOURCES_ENABLED", "false")
            get_settings.cache_clear()
        session.flush()
        response = google_callback(browser, states[0])
        assert response.status_code == 200 and "Location" not in response.headers
        exchange.assert_not_called()
        assert "synthetic-code" not in response.text
        assert response.headers["Cache-Control"] == "private, no-store"
        assert response.headers["Referrer-Policy"] == "no-referrer"


def test_google_denial_consumes_only_the_browser_owned_task(
    client, session, owners, synthetic_google
):
    from fastapi.testclient import TestClient

    states, exchange, _ = synthetic_google
    grant(session, owners)
    with TestClient(client.app, base_url="https://eimir.example") as browser:
        identifier = begin_google(browser, owners)
        assert google_callback(browser, states[0], code=None).status_code == 200
        row = session.get(PhotoSelection, identifier)
        session.refresh(row)
        assert row.status == "FAILED" and row.state_hash is None
        assert row.payload.browser_binding_hash is None
        exchange.assert_not_called()


def test_concurrent_google_callbacks_exchange_only_once_with_real_request_commits(
    production_client, synthetic_google
):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    browser, maker = production_client
    states, exchange, picker = synthetic_google
    with maker() as setup:
        account = make_account(setup, "Synthetic owner")
        space = make_space(setup, account)
        headers = auth(sign_in(setup, account))
        grant(setup, {"anna": account, "space": space})
        space_id = space.id
        setup.commit()
    started = browser.post(
        f"/api/v1/spaces/{space_id}/photo-selections",
        headers=headers,
        json={"source": "google", "maxItems": 2, "consent": True},
    )
    assert started.status_code == 201, started.text
    # This test targets real transaction serialization; separate HTTPS cookie
    # jars and their HTTP transport are covered by the browser isolation test.
    cookie_header = started.headers["set-cookie"].split(";", 1)[0]
    barrier = Barrier(2)

    def complete():
        barrier.wait(timeout=10)
        return browser.get(
            "/api/v1/photo-sources/google/callback",
            params={"state": states[0], "code": "synthetic-code"},
            headers={"Cookie": cookie_header},
            follow_redirects=False,
        ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: complete(), range(2)))
    assert sorted(responses) == [200, 303]
    exchange.assert_called_once()
    picker.create.assert_called_once()
    with maker() as verification:
        row = verification.get(PhotoSelection, UUID(started.json()["id"]))
        assert row.status == "PICKING"
        assert row.state_hash is None
        assert row.payload.browser_binding_hash is None
