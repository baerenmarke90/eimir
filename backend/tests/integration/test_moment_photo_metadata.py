"""Retained file metadata follows encrypted media and parent read boundaries."""

import io
from uuid import UUID

import pytest
from PIL import Image

from eimir.attachments import service
from eimir.attachments.models import PhotoLocationDraft
from tests.conftest import auth, requires_database
from tests.integration import test_attachment_binding as binding
from tests.integration.test_attachment_binding import couple as couple
from tests.unit.test_attachment_images import _with_metadata

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def protected_media(encryption):  # type: ignore[no-untyped-def]
    return encryption.apply("required")


@pytest.mark.parametrize("preserve", [True, False])
def test_retained_metadata_follows_file_choice_and_requires_parent_access(
    protected_media, client, couple, session, preserve
):  # type: ignore[no-untyped-def]
    disabled = client.put(
        "/api/v1/account/photo-location-preference",
        json={"enabled": False},
        headers=binding.if_match(couple["token_a"], 0),
    )
    assert disabled.status_code == 409
    assert disabled.json()["code"] == "PHOTO_LOCATIONS_ALWAYS_ENABLED"
    raw = _with_metadata()
    request = {
        "mediaType": "IMAGE",
        "originalName": "selected.jpg",
        "expectedMimeType": "image/jpeg",
        "expectedSize": len(raw),
    }
    if preserve:
        request["preserveMetadata"] = True
    created = client.post(
        f"{binding.base_path(couple['space'].id)}/attachments",
        json=request,
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201
    photo = created.json()["attachment"]["id"]
    path = f"{binding.base_path(couple['space'].id)}/attachments/{photo}"
    assert client.put(path + "/content", content=raw, headers=auth(couple["token_a"])).is_success
    assert client.post(path + "/finalize", json={}, headers=auth(couple["token_a"])).is_success
    service.validate(session, UUID(photo))
    session.flush()
    assert session.get(PhotoLocationDraft, UUID(photo)) is not None
    assert client.get(path + "/content", headers=auth(couple["token_b"])).status_code == 404
    heart = binding.heart_moment(client, couple, attachment_id=photo)
    assert heart.status_code == 201
    assert session.get(PhotoLocationDraft, UUID(photo)) is None
    primary = client.get(path + "/content", headers=auth(couple["token_b"]))
    assert primary.status_code == 200
    exif = Image.open(io.BytesIO(primary.content)).getexif()
    if preserve:
        assert exif.get_ifd(0x8825)[1] == "N"
        assert exif[0x9003] == "2025:06:13 21:15:00"
    else:
        assert exif == {}
    thumbnail = client.get(path + "/content?variant=thumbnail", headers=auth(couple["token_b"]))
    assert thumbnail.status_code == 200
    assert Image.open(io.BytesIO(thumbnail.content)).getexif() == {}
    projection = client.get(path, headers=auth(couple["token_b"]))
    assert projection.status_code == 200
    assert "preserveMetadata" not in projection.json()
    assert "latitude" not in projection.text and "longitude" not in projection.text
    hidden = client.patch(
        f"{binding.base_path(couple['space'].id)}/heart-moments/{heart.json()['id']}/visibility",
        json={"visibility": "PRIVATE"},
        headers=binding.if_match(couple["token_a"], heart.json()["version"]),
    )
    assert hidden.status_code == 200
    assert client.get(path + "/content", headers=auth(couple["token_b"])).status_code == 404


def test_metadata_intent_rejects_coerced_boolean(client, couple):  # type: ignore[no-untyped-def]
    response = client.post(
        f"{binding.base_path(couple['space'].id)}/attachments",
        json={
            "mediaType": "IMAGE",
            "originalName": "selected.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": 100,
            "preserveMetadata": "false",
        },
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 422
