"""Media encryption at rest through the real API and worker flow (issue #797).

The provider fake records the exact bytes it is handed, which is what an
object-storage operator, a bucket snapshot, or a leaked backup would contain.
"""

from __future__ import annotations

import io
from uuid import UUID

import httpx
import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir import media as media_package
from eimir.attachments import service
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.media.encrypted import MAGIC, EncryptingMediaStore
from eimir.media.s3 import S3MediaStore
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.private_s3 import PrivateS3

pytestmark = [pytest.mark.integration, requires_database]


def image_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (64, 48), (200, 30, 90)).save(buffer, "JPEG")
    return buffer.getvalue()


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/attachments"


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch, encryption) -> PrivateS3:  # type: ignore[no-untyped-def]
    """Real ``get_media_store()`` factory, over an S3 adapter backed by the fake."""
    fake = PrivateS3()
    client = httpx.Client(transport=httpx.MockTransport(fake.handle))
    monkeypatch.setenv("EIMIR_MEDIA_STORE", "s3")
    monkeypatch.setenv("EIMIR_S3_ENDPOINT", "https://s3.example.test")
    monkeypatch.setenv("EIMIR_S3_BUCKET", "eimir-private")
    monkeypatch.setenv("EIMIR_S3_ACCESS_KEY_ID", "AKIATEST")
    monkeypatch.setenv("EIMIR_S3_SECRET_ACCESS_KEY", "very-secret-value")
    monkeypatch.setattr(
        media_package,
        "_s3_store",
        lambda settings: S3MediaStore(
            endpoint="https://s3.example.test",
            region="eu-central-1",
            bucket="eimir-private",
            access_key_id="AKIATEST",
            secret_access_key="very-secret-value",
            client=client,
        ),
    )
    encryption.apply("required")
    return fake


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna Enc")
    ben = make_account(session, "Ben Enc")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {"anna": anna, "space": space, "token": sign_in(session, anna)}


def _upload(client, pair, content: bytes) -> UUID:  # type: ignore[no-untyped-def]
    created = client.post(
        path(pair["space"].id),
        json={
            "mediaType": "IMAGE",
            "originalName": "enc.jpg",
            "expectedMimeType": "image/jpeg",
            "expectedSize": len(content),
        },
        headers=auth(pair["token"]),
    )
    assert created.status_code == 201, created.text
    descriptor = created.json()
    # Presigned upload would hand plaintext straight to the provider.
    assert descriptor["method"] == "STREAM"
    assert descriptor["uploadUrl"].startswith("/api/v1/")
    attachment_id = UUID(descriptor["attachment"]["id"])
    uploaded = client.put(
        descriptor["uploadUrl"],
        content=content,
        headers={**auth(pair["token"]), "Content-Type": "application/octet-stream"},
    )
    assert uploaded.status_code == 204, uploaded.text
    return attachment_id


def _make_ready(client, pair, session: Session, content: bytes) -> UUID:  # type: ignore[no-untyped-def]
    attachment_id = _upload(client, pair, content)
    finalized = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/finalize",
        json={},
        headers=auth(pair["token"]),
    )
    assert finalized.status_code == 202, finalized.text
    service.validate(session, attachment_id)
    session.flush()
    return attachment_id


def test_factory_wraps_the_adapter_and_offers_no_provider_urls(provider: PrivateS3) -> None:
    store = media_package.get_media_store()
    assert isinstance(store, EncryptingMediaStore)
    assert not media_package.supports_signed_upload(store)


def test_provider_only_ever_holds_ciphertext_and_the_api_serves_plaintext(
    client, pair, session: Session, provider: PrivateS3
) -> None:  # type: ignore[no-untyped-def]
    content = image_bytes()
    attachment_id = _make_ready(client, pair, session, content)

    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one()
    assert attachment.status == AttachmentStatus.READY.value
    assert attachment.has_thumbnail

    # Original and derived (thumbnail) objects are both stored, both ciphertext.
    stored = list(provider.objects.items())
    assert {key.rsplit("/", 1)[1] for key, _ in stored} == {"original", "thumbnail"}
    for key, raw in stored:
        assert raw.startswith(MAGIC), key
        assert raw != content
        assert content[20:60] not in raw
        assert provider.content_types[key] == "application/octet-stream"

    read = client.post(
        f"{path(pair['space'].id)}/{attachment_id}/read-access",
        json={"parentType": "NONE"},
        headers=auth(pair["token"]),
    )
    assert read.status_code == 200
    assert read.json()["method"] == "STREAM"

    served = client.get(read.json()["url"], headers=auth(pair["token"]))
    assert served.status_code == 200
    assert Image.open(io.BytesIO(served.content)).size == (64, 48)

    thumb = client.get(f"{read.json()['url']}?variant=thumbnail", headers=auth(pair["token"]))
    assert thumb.status_code == 200
    assert Image.open(io.BytesIO(thumb.content)).format == "JPEG"


def test_tampered_provider_object_is_never_served(
    client, pair, session: Session, provider: PrivateS3
) -> None:  # type: ignore[no-untyped-def]
    attachment_id = _make_ready(client, pair, session, image_bytes())
    original_key = next(key for key in provider.objects if key.endswith("/original"))
    body = bytearray(provider.objects[original_key])
    body[-20] ^= 0x01
    provider.objects[original_key] = bytes(body)

    response = client.get(
        f"{path(pair['space'].id)}/{attachment_id}/content", headers=auth(pair["token"])
    )
    assert response.status_code == 500
    assert not response.content.startswith(b"\xff\xd8")


def test_wrong_key_material_fails_closed_instead_of_serving_bytes(
    client, pair, session: Session, provider: PrivateS3, encryption, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    attachment_id = _make_ready(client, pair, session, image_bytes())
    encryption.apply("required")  # a different, freshly generated key ring

    response = client.get(
        f"{path(pair['space'].id)}/{attachment_id}/content", headers=auth(pair["token"])
    )
    assert response.status_code == 500


def test_upload_completed_in_plaintext_after_cutover_is_rejected_and_removed(
    client, pair, session: Session, provider: PrivateS3
) -> None:  # type: ignore[no-untyped-def]
    """A presigned upload issued before the cutover can still land as plaintext."""
    content = image_bytes()
    attachment_id = _upload(client, pair, content)
    key = next(key for key in provider.objects if key.endswith("/original"))
    provider.objects[key] = content  # what a pre-cutover presigned PUT would leave behind

    client.post(
        f"{path(pair['space'].id)}/{attachment_id}/finalize",
        json={},
        headers=auth(pair["token"]),
    )
    service.validate(session, attachment_id)
    session.flush()

    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one()
    assert attachment.status == AttachmentStatus.FAILED.value
    assert key not in provider.objects


def test_delete_removes_every_encrypted_artifact(
    client, pair, session: Session, provider: PrivateS3
) -> None:  # type: ignore[no-untyped-def]
    attachment_id = _make_ready(client, pair, session, image_bytes())
    attachment = session.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    ).scalar_one()
    assert provider.objects

    service.mark_for_deletion(session, attachment)
    assert service.purge(session, attachment) is True
    assert provider.objects == {}
