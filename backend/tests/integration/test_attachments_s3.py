"""HTTP and lifecycle acceptance for the S3 transport branch."""

from __future__ import annotations

import io
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

import httpx
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.api.v1 import attachments as attachment_api
from eimir.attachments import service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.media.s3 import S3MediaStore
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


class PrivateS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.cache_control: dict[str, str] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = request.url.path
        presigned = request.url.params.get("X-Amz-Algorithm") is not None

        if request.method == "PUT":
            if presigned:
                if request.headers.get("if-none-match") != "*":
                    return httpx.Response(403)
                if request.headers.get("cache-control") != "private, no-store":
                    return httpx.Response(403)
                if key in self.objects:
                    return httpx.Response(412)
            self.objects[key] = request.content
            self.cache_control[key] = request.headers.get("cache-control", "")
            return httpx.Response(200)

        if request.method == "HEAD":
            return httpx.Response(200 if key in self.objects else 404)

        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(404)
            return httpx.Response(
                200,
                content=self.objects[key],
                headers={"Cache-Control": self.cache_control.get(key, "")},
            )

        if request.method == "DELETE":
            self.objects.pop(key, None)
            self.cache_control.pop(key, None)
            return httpx.Response(204)

        return httpx.Response(405)


def image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (120, 80, 40)).save(buffer, "JPEG")
    return buffer.getvalue()


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/attachments"


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna S3")
    ben = make_account(session, "Ben S3")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "space": space,
        "token": sign_in(session, anna),
    }


@pytest.fixture
def s3_store(monkeypatch):  # type: ignore[no-untyped-def]
    provider = PrivateS3()
    provider_client = httpx.Client(transport=httpx.MockTransport(provider.handle))
    store = S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-central-1",
        bucket="eimir-private",
        access_key_id="AKIATEST",
        secret_access_key="very-secret-value",
        client=provider_client,
        clock=lambda: datetime(2026, 8, 25, 17, 0, tzinfo=UTC),
    )
    monkeypatch.setattr(attachment_api, "get_media_store", lambda: store)
    monkeypatch.setattr(service, "get_media_store", lambda: store)
    return store, provider_client


def create(client, pair, content: bytes):  # type: ignore[no-untyped-def]
    return client.post(
        path(pair["space"].id),
        json={
            "mediaType": "IMAGE",
            "originalName": "s3.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(pair["token"]),
    )


def test_signed_upload_finalize_validation_and_read_access(
    client, pair, session: Session, s3_store
) -> None:  # type: ignore[no-untyped-def]
    _, provider_client = s3_store
    content = image_bytes()
    created = create(client, pair, content)

    assert created.status_code == 201, created.text
    descriptor = created.json()
    assert descriptor["method"] == "SIGNED_UPLOAD"
    assert descriptor["expiresAt"] is not None
    assert created.headers["cache-control"] == "private, no-store"
    assert parse_qs(urlsplit(descriptor["uploadUrl"]).query)["X-Amz-Expires"] == ["600"]
    assert descriptor["requiredHeaders"] == {
        "Cache-Control": "private, no-store",
        "Content-Type": "image/jpeg",
        "If-None-Match": "*",
    }
    assert "very-secret-value" not in descriptor["uploadUrl"]

    uploaded = provider_client.put(
        descriptor["uploadUrl"],
        content=content,
        headers=descriptor["requiredHeaders"],
    )
    assert uploaded.status_code == 200

    attachment_id = UUID(descriptor["attachment"]["id"])
    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one()
    # The provider upload alone does not determine READY state.
    assert attachment.status == AttachmentStatus.PENDING.value

    finalized = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/finalize",
        json={},
        headers=auth(pair["token"]),
    )
    assert finalized.status_code == 202, finalized.text
    assert finalized.json()["status"] == "PROCESSING"
    assert attachment.status == AttachmentStatus.VALIDATING.value

    service.validate(session, attachment_id)
    session.flush()
    assert attachment.status == AttachmentStatus.READY.value

    read = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/read-access",
        json={"parentType": "NONE"},
        headers=auth(pair["token"]),
    )
    assert read.status_code == 200, read.text
    assert read.json()["method"] == "SIGNED_URL"
    assert read.json()["expiresAt"] is not None
    assert read.headers["cache-control"] == "private, no-store"
    assert parse_qs(urlsplit(read.json()["url"]).query)["X-Amz-Expires"] == ["300"]
    assert urlsplit(read.json()["url"]).path.endswith(f"/{attachment_id}/original")

    provider_read = provider_client.get(read.json()["url"])
    assert provider_read.status_code == 200
    assert provider_read.headers["cache-control"] == "private, no-store"

    thumbnail_read = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/read-access",
        json={"parentType": "NONE", "variant": "thumbnail"},
        headers=auth(pair["token"]),
    )
    assert thumbnail_read.status_code == 200, thumbnail_read.text
    assert thumbnail_read.json()["method"] == "SIGNED_URL"
    assert thumbnail_read.json()["expiresAt"] is not None
    assert thumbnail_read.headers["cache-control"] == "private, no-store"
    assert urlsplit(thumbnail_read.json()["url"]).path.endswith(f"/{attachment_id}/thumbnail")
    assert parse_qs(urlsplit(thumbnail_read.json()["url"]).query)["X-Amz-Expires"] == ["300"]

    provider_thumbnail_read = provider_client.get(thumbnail_read.json()["url"])
    assert provider_thumbnail_read.status_code == 200
    assert provider_thumbnail_read.headers["cache-control"] == "private, no-store"

    # The original upload capability must not overwrite the now validated and
    # sanitized object even while the upload capability TTL remains valid.
    replay = provider_client.put(
        descriptor["uploadUrl"],
        content=b"replacement",
        headers=descriptor["requiredHeaders"],
    )
    assert replay.status_code == 412


def test_finalize_without_provider_object_is_rejected(client, pair, s3_store) -> None:  # type: ignore[no-untyped-def]
    del s3_store
    created = create(client, pair, image_bytes())
    attachment_id = created.json()["attachment"]["id"]

    finalized = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/finalize",
        json={},
        headers=auth(pair["token"]),
    )

    assert finalized.status_code == 409
    assert finalized.json()["code"] == "ATTACHMENT_NOT_READY"
