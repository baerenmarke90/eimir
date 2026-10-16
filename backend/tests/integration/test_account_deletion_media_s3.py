"""S3-compatible Account deletion media cleanup through the MediaStore contract."""

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO

import httpx
import pytest
from sqlalchemy.orm import Session

from eimir.attachments import service
from eimir.attachments.models import (
    Attachment,
    AttachmentPayload,
    AttachmentStatus,
    MediaType,
)
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.identity.deletion_media import apply_account_media_cleanup
from eimir.media.s3 import S3MediaStore
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class _PrivateS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}

    def handle(self, request: httpx.Request) -> httpx.Response:
        key = request.url.path
        if request.method == "PUT":
            self.objects[key] = request.content
            return httpx.Response(200)
        if request.method == "HEAD":
            return httpx.Response(200 if key in self.objects else 404)
        if request.method == "GET":
            if key not in self.objects:
                return httpx.Response(404)
            return httpx.Response(200, content=self.objects[key])
        if request.method == "DELETE":
            self.objects.pop(key, None)
            return httpx.Response(204)
        return httpx.Response(405)


def test_account_media_cleanup_uses_s3_delete_semantics(
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    owner = make_account(session, "Anna")
    space = make_space(session, owner)
    attachment = Attachment(
        space_id=space.id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/png",
        declared_size=8,
        mime_type="image/png",
        size=8,
        width=1,
        height=1,
        ready_at=now(),
        payload=AttachmentPayload(original_name="s3-account-deletion.png"),
    )
    session.add(attachment)
    session.flush()

    provider = _PrivateS3()
    client = httpx.Client(transport=httpx.MockTransport(provider.handle))
    store = S3MediaStore(
        endpoint="https://s3.example.test",
        region="eu-central-1",
        bucket="eimir-private",
        access_key_id="AKIATEST",
        secret_access_key="very-secret-value",
        client=client,
        clock=lambda: datetime(2026, 9, 4, 18, 0, tzinfo=UTC),
    )
    monkeypatch.setattr(service, "get_media_store", lambda: store)
    storage_key = service.storage_key_for(attachment)
    store.put(storage_key, BytesIO(b"original"), "image/png")
    assert store.exists(storage_key)

    apply_accepted_tombstone(session, owner.id, accepted_at=now())
    apply_core_cleanup(session, owner.id)
    result = apply_account_media_cleanup(session, owner.id)

    assert result.purged == 1
    assert result.converged
    assert session.get(Attachment, attachment.id) is None
    assert not store.exists(storage_key)
    assert provider.objects == {}
