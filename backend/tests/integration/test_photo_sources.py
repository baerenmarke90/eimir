"""Real authentication, tenant/device ownership, Pro and credential lifecycle."""

from datetime import timedelta
from uuid import UUID

import pytest
from sqlalchemy import select, text

from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability, EntitlementSourceType, EntitlementStatus
from eimir.photo_sources import service
from eimir.photo_sources.models import PhotoConnection, PhotoSelection
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


def test_google_callback_consumes_state_once_and_keeps_tokens_out_of_browser(
    client, session, owners, monkeypatch
):
    grant(session, owners)
    monkeypatch.setattr(
        service.google_photos,
        "authorization",
        lambda: ("https://accounts.google.com/authorize", "private-state", "private-verifier"),
    )
    calls = []

    def exchange(code, state, verifier):
        calls.append((code, state, verifier))
        return "synthetic-google-token"

    class Picker:
        def __init__(self, token):
            assert token == "synthetic-google-token"

        def create(self, maximum):
            return {"id": "private-picker", "pickerUri": "https://photos.google.com/picker"}

        def delete(self, identifier):
            assert identifier == "private-picker"

    monkeypatch.setattr(service.google_photos, "exchange", exchange)
    monkeypatch.setattr(service.google_photos, "GooglePhotoPicker", Picker)
    selection = client.post(
        path(owners) + "/photo-selections",
        headers=owners["a"],
        json={"source": "google", "maxItems": 2, "consent": True},
    )
    assert selection.status_code == 201
    callback = "/api/v1/photo-sources/google/callback?state=private-state&code=one-use-code"
    response = client.get(callback, follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["Location"] == "https://photos.google.com/picker"
    assert client.get(callback, follow_redirects=False).status_code == 200
    assert len(calls) == 1
    row = session.get(PhotoSelection, UUID(selection.json()["id"]))
    assert row.payload.oauth_state is None and row.payload.code_verifier is None
    assert row.status == "PICKING"
    assert (
        client.delete(path(owners) + f"/photo-selections/{row.id}", headers=owners["a"]).status_code
        == 204
    )


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
