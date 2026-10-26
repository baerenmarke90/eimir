"""HTTP/PostgreSQL acceptance for default-on photo places (#1459)."""

import io
import json
from uuid import UUID
from zipfile import ZipFile

import pytest
from PIL import Image
from sqlalchemy import func, select

from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment
from eimir.authorization import AuthorizationContext
from eimir.media import get_media_store
from eimir.places.models import Place
from eimir.transfer import service as transfer_service
from eimir.transfer.models import TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.integration import test_attachment_binding as media
from tests.integration.test_attachment_binding import couple as couple
from tests.unit.test_photo_coordinates import gps_image

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture(autouse=True)
def photo_bytes(monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(media, "image_bytes", gps_image)


def preference(client, couple, enabled):  # type: ignore[no-untyped-def]
    route = "/api/v1/account/photo-location-preferences"
    previous = client.get(route, headers=auth(couple["token_a"]))
    return client.put(
        route,
        json={"enabled": enabled},
        headers={**auth(couple["token_a"]), "If-Match": previous.headers["ETag"]},
    )


def bind(client, couple, parent, attachment_ids):  # type: ignore[no-untyped-def]
    return client.put(
        f"{media.base_path(couple['space'].id)}/memories/{parent['id']}/attachments",
        json={
            "attachments": [
                {"attachmentId": identifier, "position": index}
                for index, identifier in enumerate(attachment_ids)
            ]
        },
        headers=media.if_match(couple["token_a"], parent["version"]),
    )


def linked(client, couple, parent_id, kind="memories", token_key="token_a"):  # type: ignore[no-untyped-def]
    return client.get(
        f"{media.base_path(couple['space'].id)}/{kind}/{parent_id}/places",
        headers=auth(couple[token_key]),
    )


def test_account_setting_defaults_on_is_personal_and_rejects_stale_writes(client, couple):  # type: ignore[no-untyped-def]
    route = "/api/v1/account/photo-location-preferences"
    initial = client.get(route, headers=auth(couple["token_a"]))
    assert initial.status_code == 200 and initial.json()["enabled"] is True
    assert preference(client, couple, False).json()["enabled"] is False
    assert client.get(route, headers=auth(couple["token_b"])).json()["enabled"] is True
    stale = client.put(
        route,
        json={"enabled": True},
        headers={**auth(couple["token_a"]), "If-Match": initial.headers["ETag"]},
    )
    assert stale.status_code == 409
    assert client.get(route).status_code == 401
    assert preference(client, couple, True).json()["enabled"] is True


def test_real_gps_becomes_shared_canonical_place_and_staging_is_consumed(client, couple, session):  # type: ignore[no-untyped-def]
    parent = media.memory(client, couple)
    identifiers = [
        media.ready_attachment(client, couple, session, photo_location_candidate=True)
        for _ in range(2)
    ]
    assert session.get(Attachment, UUID(identifiers[0])).payload.photo_coordinates is not None
    saved = bind(client, couple, parent, identifiers)
    assert saved.status_code == 200, saved.text
    result = linked(client, couple, parent["id"])
    assert result.status_code == 200, result.text
    places = result.json()["items"]
    assert len(places) == 1  # Nearby photos in one batch do not create a pile of duplicate pins.
    assert places[0]["photoLocation"] is True
    assert (places[0]["latitude"], places[0]["longitude"]) == (52.5, 13.4)
    assert linked(client, couple, parent["id"], token_key="token_b").json() == result.json()
    assert session.get(Attachment, UUID(identifiers[0])).payload.photo_coordinates is None
    assert bind(client, couple, saved.json(), identifiers).status_code == 200
    assert session.scalar(select(func.count()).select_from(Place)) == 1
    place_id = places[0]["id"]
    removed = client.delete(
        f"{media.base_path(couple['space'].id)}/places/{place_id}/memories/{parent['id']}",
        headers=auth(couple["token_a"]),
    )
    assert removed.status_code == 204
    current = client.get(
        f"{media.base_path(couple['space'].id)}/memories/{parent['id']}",
        headers=auth(couple["token_a"]),
    ).json()
    assert bind(client, couple, current, identifiers).status_code == 200
    assert linked(client, couple, parent["id"]).json()["items"] == []


@pytest.mark.parametrize("disable_before_upload", [True, False])
def test_disable_is_enforced_at_ingest_and_again_at_binding(
    client, couple, session, disable_before_upload
):  # type: ignore[no-untyped-def]
    if disable_before_upload:
        assert preference(client, couple, False).status_code == 200
    identifier = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    if disable_before_upload:
        assert session.get(Attachment, UUID(identifier)).payload.photo_coordinates is None
    else:
        assert preference(client, couple, False).status_code == 200
    parent = media.memory(client, couple)
    assert bind(client, couple, parent, [identifier]).status_code == 200
    assert linked(client, couple, parent["id"]).json()["items"] == []
    assert session.scalar(select(func.count()).select_from(Place)) == 0


def test_manual_place_takes_precedence_over_photo_metadata(client, couple, session):  # type: ignore[no-untyped-def]
    parent = media.memory(client, couple)
    base = media.base_path(couple["space"].id)
    place = client.post(
        f"{base}/places", json={"name": "Our chosen spot"}, headers=auth(couple["token_a"])
    ).json()
    assert (
        client.put(
            f"{base}/places/{place['id']}/memories/{parent['id']}", headers=auth(couple["token_a"])
        ).status_code
        == 204
    )
    identifier = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    assert bind(client, couple, parent, [identifier]).status_code == 200
    assert [p["id"] for p in linked(client, couple, parent["id"]).json()["items"]] == [place["id"]]
    assert session.scalar(select(func.count()).select_from(Place)) == 1


@pytest.mark.parametrize("visibility,expected", [("PRIVATE", 0), ("SHARED", 1)])
def test_heart_moment_photo_places_respect_visibility(
    client, couple, session, visibility, expected
):  # type: ignore[no-untyped-def]
    identifier = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    response = media.heart_moment(client, couple, attachment_id=identifier, visibility=visibility)
    assert response.status_code == 201, response.text
    parent = response.json()
    assert len(linked(client, couple, parent["id"], "heart-moments").json()["items"]) == expected
    if visibility == "PRIVATE":
        assert linked(client, couple, parent["id"], "heart-moments", "token_b").status_code == 404
    assert session.scalar(select(func.count()).select_from(Place)) == expected


def test_foreign_space_cannot_read_photo_places(client, couple, session):  # type: ignore[no-untyped-def]
    parent = media.memory(client, couple)
    assert (
        bind(
            client,
            couple,
            parent,
            [media.ready_attachment(client, couple, session, photo_location_candidate=True)],
        ).status_code
        == 200
    )
    outsider = make_account(session, "Outsider")
    space = make_space(session, outsider)
    token = sign_in(session, outsider)
    response = client.get(
        f"{media.base_path(space.id)}/memories/{parent['id']}/places", headers=auth(token)
    )
    assert response.status_code == 404


def test_unrelated_uploads_do_not_extract_or_preserve_gps(client, couple, session):  # type: ignore[no-untyped-def]
    identifier = media.ready_attachment(client, couple, session)
    row = session.get(Attachment, UUID(identifier))
    assert row is not None and row.payload.photo_coordinates is None
    with get_media_store().open(attachment_service.storage_key_for(row)) as content:
        assert Image.open(io.BytesIO(content.read())).getexif() == {}


def test_disabled_association_still_preserves_selected_photo_metadata(client, couple, session):  # type: ignore[no-untyped-def]
    assert preference(client, couple, False).status_code == 200
    identifier = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    row = session.get(Attachment, UUID(identifier))
    assert row is not None and row.payload.photo_coordinates is None
    with get_media_store().open(attachment_service.storage_key_for(row)) as content:
        assert Image.open(io.BytesIO(content.read())).getexif().get_ifd(0x8825)[1] == "N"


def test_distant_photos_keep_separate_real_positions(client, couple, session, monkeypatch):  # type: ignore[no-untyped-def]
    first = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    monkeypatch.setattr(
        media, "image_bytes", lambda: gps_image({1: "N", 2: (48, 0, 0), 3: "E", 4: (11, 0, 0)})
    )
    second = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    parent = media.memory(client, couple)
    assert bind(client, couple, parent, [first, second]).status_code == 200
    positions = {
        (p["latitude"], p["longitude"])
        for p in linked(client, couple, parent["id"]).json()["items"]
    }
    assert positions == {(52.5, 13.4), (48, 11)}


def test_later_sharing_does_not_mine_a_private_photo(client, couple, session):  # type: ignore[no-untyped-def]
    identifier = media.ready_attachment(client, couple, session, photo_location_candidate=True)
    parent = media.heart_moment(
        client, couple, attachment_id=identifier, visibility="PRIVATE"
    ).json()
    response = client.patch(
        f"{media.base_path(couple['space'].id)}/heart-moments/{parent['id']}/visibility",
        json={"visibility": "SHARED"},
        headers=media.if_match(couple["token_a"], parent["version"]),
    )
    assert response.status_code == 200, response.text
    assert linked(client, couple, parent["id"], "heart-moments").json()["items"] == []
    assert session.scalar(select(func.count()).select_from(Place)) == 0


def test_personal_preference_is_exportable_without_disclosing_partner_choice(
    client, couple, session
):  # type: ignore[no-untyped-def]
    assert preference(client, couple, False).status_code == 200
    context = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    personal = transfer_service.build_export_archive(session, context, TransferScope.PERSONAL)
    with ZipFile(personal) as archive:
        document = json.loads(archive.read("accounts.json"))
        assert document["personalPhotoLocations"] == {"enabled": False}
        assert all("autoPhotoLocations" not in member for member in document["members"])
    shared = transfer_service.build_export_archive(session, context, TransferScope.SHARED)
    with ZipFile(shared) as archive:
        assert "personalPhotoLocations" not in json.loads(archive.read("accounts.json"))


@pytest.mark.parametrize(
    "value",
    [
        "https://maps.app.goo.gl/Example123",
        "https://www.google.com/maps/search/?api=1&query=52.5,13.4",
    ],
)
def test_supported_map_links_round_trip_without_network_lookup(client, couple, value):  # type: ignore[no-untyped-def]
    response = client.post(
        f"{media.base_path(couple['space'].id)}/places",
        json={"name": "Saved spot", "mapUrl": value},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201, response.text
    assert response.json()["mapUrl"] == value


@pytest.mark.parametrize(
    "value",
    [
        "https://google.com.evil.test/maps/a",
        "javascript:alert(1)",
        "https://user:password@www.google.com/maps/a",
    ],
)
def test_unsupported_map_links_are_rejected(client, couple, value):  # type: ignore[no-untyped-def]
    response = client.post(
        f"{media.base_path(couple['space'].id)}/places",
        json={"name": "A place", "mapUrl": value},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 422
