"""Real authentication, tenant/device ownership, Pro and credential lifecycle."""

import io
from datetime import timedelta
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest
from PIL import Image
from pydantic import SecretStr
from sqlalchemy import func, select, text

from eimir.auth.sessions import resolve
from eimir.auth.tokens import hash_token
from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.photo_sources import service
from eimir.photo_sources.models import (
    GoogleAccountHint,
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


@pytest.mark.parametrize("method", ["get", "post"])
def test_selection_is_bound_to_device_account_and_space_before_transfer(
    client, session, owners, method
):
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
    read = getattr(client, method)
    for headers in [owners["b"], owners["second"], owners["out"]]:
        assert read(target + "/items/" + item, headers=headers).status_code == 404
    assert read(target + "/items/" + item).status_code == 401
    assert read(target + "/items/unselected", headers=owners["a"]).status_code == 404
    photo = read(target + "/items/" + item, headers=owners["a"])
    assert photo.content == b"selected-photo"
    assert photo.headers["Cache-Control"] == "private, no-store"
    assert client.delete(target, headers=owners["a"]).status_code == 204
    assert session.scalar(select(PhotoSelection)) is None
    assert read(target + "/items/" + item, headers=owners["a"]).status_code == 404


@pytest.mark.parametrize("method", ["get", "post"])
@pytest.mark.parametrize("thumbnail", [True, False])
def test_photo_reads_preserve_decodable_binary_bytes_and_private_headers(
    client, session, owners, monkeypatch, method, thumbnail
):
    from eimir.attachments.images import process
    from eimir.attachments.limits import rule_for

    target = io.BytesIO()
    Image.new("RGB", (32, 24), (65, 130, 220)).save(target, format="JPEG")
    content = target.getvalue()

    def photo(self, selected, expected_owner):
        assert expected_owner == str(EXTERNAL_ACCOUNT)
        return SelectedPhoto(content, "image/jpeg", "selected-photo.jpg")

    monkeypatch.setattr(ImmichFixture, "read_selected_photo", photo)
    monkeypatch.setattr(ImmichFixture, "thumbnail", photo, raising=False)
    grant(session, owners)
    assert link(client, owners).status_code == 204
    selection = begin(client, owners)
    item = selection["items"][0]["id"]
    response = getattr(client, method)(
        path(owners) + f"/photo-selections/{selection['id']}/items/{item}",
        params={"thumbnail": str(thumbnail).lower()},
        headers=owners["a"],
    )
    assert response.status_code == 200
    assert response.content == content
    assert response.headers["Content-Type"] == "image/jpeg"
    assert response.headers["Cache-Control"] == "private, no-store"
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    rule = rule_for("image/jpeg")
    assert rule is not None
    processed = process(response.content, rule)
    assert (processed.width, processed.height) == (32, 24)


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
        json={
            "source": "google",
            "maxItems": 2,
            "consent": True,
            "mediaRecoveryPolicy": "memory-only-v1",
        },
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
    from eimir.providers.google_photos_config import GooglePhotosClient

    oauth_client = GooglePhotosClient(
        "synthetic.apps.googleusercontent.com",
        SecretStr("synthetic-client-secret"),
        "https://eimir.example/api/v1/photo-sources/google/callback",
    )
    monkeypatch.setattr(service.google_photos, "client_configuration", lambda: oauth_client)

    # Deliberately test the future binding behind the unchanged literal gate.
    # No production setting or test application configuration enables Google.
    monkeypatch.setattr(service, "google_import_available", lambda: True)
    states = []

    def authorization(*, client, login_hint=None):
        assert client == oauth_client
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
        "pollingConfig": {"pollInterval": "5s", "timeoutIn": "600s"},
    }
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Mock(return_value=picker))
    return states, exchange, picker


def begin_google(browser, owners):
    response = browser.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={
            "source": "google",
            "maxItems": 2,
            "consent": True,
            "mediaRecoveryPolicy": "memory-only-v1",
        },
    )
    assert response.status_code == 201, response.text
    return UUID(response.json()["id"])


def test_google_admission_requires_the_new_client_recovery_contract(
    client, session, owners, synthetic_google
):
    states, exchange, _ = synthetic_google
    grant(session, owners)
    base = {"source": "google", "maxItems": 2, "consent": True}
    old_client = client.post(path(owners) + "/photo-selections", headers=owners["a"], json=base)
    assert old_client.status_code == 503
    unsupported = client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={**base, "mediaRecoveryPolicy": "raw-file-v0"},
    )
    assert unsupported.status_code == 422
    assert states == []
    exchange.assert_not_called()
    assert session.scalar(select(PhotoSelection)) is None


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
        exchange.assert_called_once_with(
            "synthetic-code",
            state,
            "synthetic-verifier",
            client=service.google_photos.client_configuration(),
        )
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
        json={
            "source": "google",
            "maxItems": 2,
            "consent": True,
            "mediaRecoveryPolicy": "memory-only-v1",
        },
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


# ---- #1467 test eligibility: a narrow, fail-closed path that never changes the production gate.

LISTED = "anna.test@eimir.example"


@pytest.fixture
def eligible_google(monkeypatch):
    """Synthetic provider WITHOUT patching the literal production gate."""
    from eimir.auth.tokens import generate_token
    from eimir.providers.google_photos_config import GooglePhotosClient

    oauth_client = GooglePhotosClient(
        "synthetic.apps.googleusercontent.com",
        SecretStr("synthetic-client-secret"),
        "https://eimir.example/api/v1/photo-sources/google/callback",
    )
    monkeypatch.setattr(service.google_photos, "client_configuration", lambda: oauth_client)
    states = []

    def authorization(*, client, login_hint=None):
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
        "pollingConfig": {"pollInterval": "5s", "timeoutIn": "600s"},
    }
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Mock(return_value=picker))
    monkeypatch.setenv("EIMIR_GOOGLE_PHOTOS_CLIENT_ID", "synthetic.apps.googleusercontent.com")
    monkeypatch.setenv("EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET", "synthetic-client-secret")
    get_settings.cache_clear()
    return states, exchange, picker


def set_test_list(monkeypatch, *addresses):
    import json

    monkeypatch.setenv("EIMIR_GOOGLE_PHOTOS_TEST_ACCOUNT_EMAILS", json.dumps(list(addresses)))
    get_settings.cache_clear()


def add_address(session, account, address, *, verified):
    from eimir.identity.models import AccountEmail

    session.add(
        AccountEmail(
            account_id=account.id,
            email=address,
            verified_at=now() if verified else None,
            is_primary=True,
        )
    )
    session.flush()


def google_availability(client, owners):
    return client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
        "googleAvailable"
    ]


def start_google(client, owners):
    return client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={
            "source": "google",
            "maxItems": 2,
            "consent": True,
            "mediaRecoveryPolicy": "memory-only-v1",
        },
    )


def test_listed_verified_address_opens_google_while_the_production_gate_stays_closed(
    client, session, owners, eligible_google, monkeypatch
):
    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    # Default closed even with a verified address and complete configuration.
    assert google_availability(client, owners) is False
    assert start_google(client, owners).status_code == 503
    set_test_list(monkeypatch, LISTED.upper())
    assert service.google_import_available() is False
    assert google_availability(client, owners) is True
    assert start_google(client, owners).status_code == 201


@pytest.mark.parametrize("case", ["unlisted-address", "unverified-address", "other-account"])
def test_google_test_eligibility_rejects_every_missing_prerequisite(
    client, session, owners, eligible_google, monkeypatch, case
):
    states, exchange, _ = eligible_google
    grant(session, owners)
    if case == "unlisted-address":
        add_address(session, owners["anna"], "someone.else@eimir.example", verified=True)
    if case == "unverified-address":
        add_address(session, owners["anna"], LISTED, verified=False)
    if case == "other-account":
        add_address(session, owners["anna"], "someone.else@eimir.example", verified=True)
        other = make_account(session, "Listed Other")
        add_address(session, other, LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    assert google_availability(client, owners) is False
    assert start_google(client, owners).status_code == 503
    assert states == []
    exchange.assert_not_called()
    assert session.scalar(select(PhotoSelection)) is None


def test_test_eligibility_does_not_replace_the_external_sync_entitlement(
    client, session, owners, eligible_google, monkeypatch
):
    states, _, _ = eligible_google
    add_address(session, owners["anna"], LISTED, verified=True)  # listed, but no Pro grant
    set_test_list(monkeypatch, LISTED)
    availability = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert availability["canImport"] is False
    assert start_google(client, owners).status_code == 403
    assert states == []
    assert session.scalar(select(PhotoSelection)) is None


@pytest.mark.parametrize("missing", ["encryption", "https", "client"])
def test_google_test_eligibility_requires_instance_prerequisites(
    client, session, owners, eligible_google, monkeypatch, encryption, missing
):
    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    assert google_availability(client, owners) is True
    if missing == "encryption":
        # Configuration validation refuses Google without required encryption: the instance
        # cannot load these settings, so no eligibility can exist.
        encryption.apply("disabled")
        get_settings.cache_clear()
        with pytest.raises(ValueError, match="ENCRYPTION_AT_REST"):
            get_settings()
        return
    if missing == "https":
        # Configuration validation already refuses Google without HTTPS: the instance cannot
        # even load these settings, so no eligibility can exist.
        monkeypatch.setenv("EIMIR_PUBLIC_BASE_URL", "http://eimir.example")
        get_settings.cache_clear()
        with pytest.raises(ValueError, match="HTTPS"):
            get_settings()
        return
    if missing == "client":
        monkeypatch.delenv("EIMIR_GOOGLE_PHOTOS_CLIENT_ID")
        monkeypatch.delenv("EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET")
    get_settings.cache_clear()
    assert service.google_test_eligible(session, owners["anna"].id) is False


def test_removing_the_address_revokes_polling_but_not_cancellation(
    client, session, owners, eligible_google, monkeypatch
):
    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    identifier = start_google(client, owners).json()["id"]
    set_test_list(monkeypatch)  # operator empties the list
    poll = client.post(path(owners) + f"/photo-selections/{identifier}/poll", headers=owners["a"])
    assert poll.status_code == 503
    cancel = client.delete(path(owners) + f"/photo-selections/{identifier}", headers=owners["a"])
    assert cancel.status_code == 204
    assert session.get(PhotoSelection, UUID(identifier)) is None


def test_eligible_callback_completes_once_and_a_removed_address_cannot_finish_it(
    client, session, owners, eligible_google, monkeypatch
):
    from fastapi.testclient import TestClient

    states, exchange, _ = eligible_google
    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    with (
        TestClient(client.app, base_url="https://eimir.example") as completing,
        TestClient(client.app, base_url="https://eimir.example") as revoked,
    ):
        first = begin_google(completing, owners)
        second = begin_google(revoked, owners)
        assert service.google_import_available() is False
        accepted = google_callback(completing, states[0])
        assert accepted.status_code == 303
        exchange.assert_called_once()
        assert session.get(PhotoSelection, first).status == "PICKING"
        # The operator empties the list before the second browser returns: nothing is exchanged.
        set_test_list(monkeypatch)
        denied = google_callback(revoked, states[1])
        assert denied.status_code == 200 and "Location" not in denied.headers
        exchange.assert_called_once()
        assert session.get(PhotoSelection, second).status == "AUTHORIZING"


def test_removing_the_verified_address_revokes_reading_as_well(
    client, session, owners, eligible_google, monkeypatch
):
    from eimir.identity.models import AccountEmail

    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    identifier = start_google(client, owners).json()["id"]
    row = session.get(PhotoSelection, UUID(identifier))
    row.status = "READY"
    row.payload = row.payload.model_copy(
        update={
            "access_token": "synthetic-google-token",
            "provider_session_id": "synthetic-picker",
            "items": [
                SelectedPhotoItem(
                    id="selected-local-item",
                    source_id="synthetic-provider-item",
                    mime_type="image/jpeg",
                    source_url="https://lh3.googleusercontent.com/synthetic",
                )
            ],
        }
    )
    session.flush()
    session.query(AccountEmail).filter(AccountEmail.account_id == owners["anna"].id).delete()
    session.flush()
    read = client.get(
        path(owners) + f"/photo-selections/{identifier}/items/selected-local-item",
        headers=owners["a"],
    )
    assert read.status_code == 503


GOOGLE_HINT = "Anna.Private@Gmail.Example"
GOOGLE_HINT_NORMALIZED = "anna.private@gmail.example"


def hint_endpoint(owners):
    return path(owners) + "/photo-sources/google/account"


def hint_token(client, owners, who="a"):
    return client.get(path(owners) + "/photo-sources", headers=owners[who]).json()[
        "googleAccountToken"
    ]


def save_hint(client, owners, email=GOOGLE_HINT, *, who="a", token=None, consent=True):
    return client.put(
        hint_endpoint(owners),
        headers={**owners[who], "If-Match": token or hint_token(client, owners, who)},
        json={"email": email, "consent": consent},
    )


def remove_hint(client, owners, *, who="a", token=None):
    return client.delete(
        hint_endpoint(owners),
        headers={**owners[who], "If-Match": token or hint_token(client, owners, who)},
    )


@pytest.fixture
def hinted_google(session, owners, eligible_google, monkeypatch):
    """An eligible, entitled Account plus a spy on the address handed to Google."""
    grant(session, owners)
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    fake = service.google_photos.authorization
    hints = []

    def spy(*, client, login_hint=None):
        hints.append(login_hint)
        return fake(client=client, login_hint=login_hint)

    monkeypatch.setattr(service.google_photos, "authorization", spy)
    return hints


def test_saved_google_account_is_private_encrypted_and_reaches_only_the_google_url(
    client, session, owners, hinted_google
):
    assert start_google(client, owners).status_code == 201
    assert hinted_google == [None]  # without a saved account Google keeps asking
    assert save_hint(client, owners).status_code == 204
    own = client.get(path(owners) + "/photo-sources", headers=owners["a"])
    assert own.json()["googleAccountEmail"] == GOOGLE_HINT_NORMALIZED
    assert own.headers["Cache-Control"] == "private, no-store"
    partner = client.get(path(owners) + "/photo-sources", headers=owners["b"]).json()
    assert partner["googleAccountEmail"] is None
    assert partner["googleAccountToken"].endswith(":google-account:absent")
    raw = session.execute(text("SELECT payload FROM google_account_hints")).scalar_one()
    assert raw["_enc"] == 2
    assert GOOGLE_HINT_NORMALIZED not in str(raw)
    assert "gmail.example" not in str(raw)
    # The pre-existing selection is kept; only a new start uses the new address.
    other = client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={
            "source": "google",
            "maxItems": 2,
            "consent": True,
            "mediaRecoveryPolicy": "memory-only-v1",
        },
    )
    assert other.status_code == 201
    assert hinted_google == [None, GOOGLE_HINT_NORMALIZED]
    assert GOOGLE_HINT_NORMALIZED not in other.text


def test_changing_and_removing_the_google_account_restores_the_previous_behavior(
    client, session, owners, hinted_google
):
    assert save_hint(client, owners).status_code == 204
    assert save_hint(client, owners, "second@gmail.example").status_code == 204
    assert (
        client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()[
            "googleAccountEmail"
        ]
        == "second@gmail.example"
    )
    assert remove_hint(client, owners).status_code == 204
    assert session.scalar(select(GoogleAccountHint)) is None
    available = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert available["googleAccountEmail"] is None
    assert start_google(client, owners).status_code == 201
    assert hinted_google == [None]


def test_google_account_uses_if_match_and_cannot_cross_accounts(
    client, session, owners, hinted_google
):
    assert save_hint(client, owners).status_code == 204
    stale = hint_token(client, owners)
    assert save_hint(client, owners, "second@gmail.example").status_code == 204
    assert save_hint(client, owners, token=stale).status_code == 409
    assert remove_hint(client, owners, token=stale).status_code == 409
    # A missing precondition neither replaces nor removes the saved address.
    endpoint = hint_endpoint(owners)
    body = {"email": GOOGLE_HINT, "consent": True}
    assert client.put(endpoint, headers=owners["a"], json=body).status_code == 422
    assert client.delete(endpoint, headers=owners["a"]).status_code == 422
    # The partner shares the Space but not the Account: reading, replacing and removing
    # never see or touch Anna's row, even when Anna's own token is presented.
    anna_token = hint_token(client, owners)
    assert save_hint(client, owners, "partner@gmail.example", who="b").status_code == 503
    assert remove_hint(client, owners, who="b", token=anna_token).status_code == 409
    assert remove_hint(client, owners, who="b").status_code == 204  # nothing of his own to erase
    own = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert own["googleAccountEmail"] == "second@gmail.example"
    anonymous = client.put(endpoint, headers={"If-Match": '"x"'}, json=body)
    assert anonymous.status_code == 401
    outsider = client.put(endpoint, headers={**owners["out"], "If-Match": '"x"'}, json=body)
    assert outsider.status_code in (403, 404)
    assert session.scalar(select(func.count()).select_from(GoogleAccountHint)) == 1


@pytest.mark.parametrize(
    "email",
    [
        "no-at-sign",
        "a@b",
        "two@@gmail.example",
        "white space@gmail.example",
        "tab\t@gmail.example",
        'quote"@gmail.example',
        "angle<@gmail.example",
        "a" * 250 + "@gmail.example",
        "",
    ],
)
def test_malformed_or_oversized_google_account_is_rejected_without_echo(
    client, session, owners, hinted_google, email
):
    response = save_hint(client, owners, email)
    assert response.status_code == 422
    assert email.strip() == "" or email not in response.text
    assert session.scalar(select(GoogleAccountHint)) is None


def test_google_account_needs_explicit_consent_and_no_extra_fields(
    client, session, owners, hinted_google
):
    assert save_hint(client, owners, consent=False).status_code == 422
    response = client.put(
        hint_endpoint(owners),
        headers={**owners["a"], "If-Match": hint_token(client, owners)},
        json={"email": GOOGLE_HINT, "consent": True, "scope": "everything"},
    )
    assert response.status_code == 422
    assert session.scalar(select(GoogleAccountHint)) is None


def test_google_account_follows_the_entitlement_and_the_closed_gate(
    client, session, owners, eligible_google, monkeypatch
):
    # No Pro entitlement: refused like every external-sync setting.
    add_address(session, owners["anna"], LISTED, verified=True)
    set_test_list(monkeypatch, LISTED)
    assert save_hint(client, owners).status_code == 403
    grant(session, owners)
    assert save_hint(client, owners).status_code == 204
    # The operator closes the test list: nothing new can be saved, removal always works.
    set_test_list(monkeypatch)
    assert save_hint(client, owners, "second@gmail.example").status_code == 503
    available = client.get(path(owners) + "/photo-sources", headers=owners["a"]).json()
    assert available["googleAvailable"] is False
    assert remove_hint(client, owners).status_code == 204
    assert session.scalar(select(GoogleAccountHint)) is None


def test_google_account_never_reaches_logs_or_other_exports_and_is_purged_with_the_account(
    client, session, owners, hinted_google, caplog
):
    import json
    from zipfile import ZipFile

    from eimir.authorization import AuthorizationContext
    from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
    from eimir.transfer.models import TransferScope
    from eimir.transfer.service import build_export_archive

    with caplog.at_level("DEBUG"):
        assert save_hint(client, owners).status_code == 204
        assert start_google(client, owners).status_code == 201
        assert save_hint(client, owners, "bad address").status_code == 422
        assert remove_hint(client, owners).status_code == 204
        assert save_hint(client, owners).status_code == 204
    assert "gmail.example" not in caplog.text.lower()

    def exported(account, scope):
        context = AuthorizationContext(account_id=account.id, space_id=owners["space"].id)
        with build_export_archive(session, context, scope) as buffer, ZipFile(buffer) as archive:
            return json.loads(archive.read("accounts.json")), b"".join(
                archive.read(name) for name in archive.namelist()
            )

    personal, _ = exported(owners["anna"], TransferScope.PERSONAL)
    assert personal["personalGoogleAccountHint"] == GOOGLE_HINT_NORMALIZED
    shared, shared_bytes = exported(owners["anna"], TransferScope.SHARED)
    assert "personalGoogleAccountHint" not in shared
    assert b"gmail.example" not in shared_bytes
    apply_accepted_tombstone(session, owners["anna"].id, accepted_at=now())
    apply_core_cleanup(session, owners["anna"].id)
    session.expire_all()
    assert session.scalar(select(GoogleAccountHint)) is None
