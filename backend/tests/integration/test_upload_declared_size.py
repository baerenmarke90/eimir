"""An upload never stores more than it declared (#2141).

The declared size is what the Space's storage quota reserved, so a client must
not reserve little and then send more. The server stream stops at the declared
size; worker validation fails an object larger than declared, which also covers
a direct provider upload whose signature does not bind the length. An honest
upload is unchanged.
"""

from __future__ import annotations

import io
from pathlib import Path
from uuid import UUID

import pytest
from PIL import Image
from sqlalchemy.orm import Session

from eimir.attachments import audios, service, video_jobs
from eimir.attachments.models import Attachment, AttachmentStatus
from eimir.config import get_settings
from eimir.media import get_media_store
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

VOICE = Path(__file__).parents[1] / "fixtures/media/voice/short.ogg"


def _photo() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (32, 24), (10, 20, 30)).save(buffer, "JPEG")
    return buffer.getvalue()


@pytest.fixture
def audio_enabled(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_AUDIO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def member(session: Session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    space = make_space(session, account)
    return {"space": space, "token": sign_in(session, account)}


def _register(client, member, size: int, media_type: str = "IMAGE") -> str:  # type: ignore[no-untyped-def]
    mime, name = ("image/jpeg", "photo.jpg") if media_type == "IMAGE" else ("audio/ogg", "v.ogg")
    created = client.post(
        f"/api/v1/spaces/{member['space'].id}/attachments",
        json={
            "mediaType": media_type,
            "originalName": name,
            "expectedMimeType": mime,
            "expectedSize": size,
        },
        headers=auth(member["token"]),
    )
    assert created.status_code == 201, created.text
    return str(created.json()["attachment"]["id"])


def _content(member, identifier: str) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{member['space'].id}/attachments/{identifier}/content"


def _stored_directly(session: Session, identifier: str, content: bytes, mime: str) -> Attachment:
    """Bytes a direct provider upload wrote, awaiting validation."""
    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    get_media_store().put(service.storage_key_for(attachment), io.BytesIO(content), mime)
    attachment.status = AttachmentStatus.VALIDATING.value
    session.flush()
    return attachment


def test_the_stream_stops_at_the_declared_size(client, session, member) -> None:  # type: ignore[no-untyped-def]
    content = _photo()
    identifier = _register(client, member, len(content) - 1)

    sent = client.put(_content(member, identifier), content=content, headers=auth(member["token"]))

    assert sent.status_code == 413, sent.text
    assert sent.json()["code"] == "ATTACHMENT_TOO_LARGE"
    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    session.refresh(attachment)
    assert attachment.status == AttachmentStatus.PENDING.value


def test_an_honest_stream_upload_is_unchanged(client, session, member) -> None:  # type: ignore[no-untyped-def]
    content = _photo()
    identifier = _register(client, member, len(content))

    sent = client.put(_content(member, identifier), content=content, headers=auth(member["token"]))
    assert sent.status_code == 204, sent.text
    finalized = client.post(
        f"/api/v1/spaces/{member['space'].id}/attachments/{identifier}/finalize",
        json={},
        headers=auth(member["token"]),
    )
    assert finalized.status_code == 202, finalized.text
    service.validate(session, UUID(identifier))
    session.flush()

    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    assert attachment.status == AttachmentStatus.READY.value


def test_less_than_declared_is_still_accepted(client, session, member) -> None:  # type: ignore[no-untyped-def]
    content = _photo()
    identifier = _register(client, member, len(content) + 100)

    sent = client.put(_content(member, identifier), content=content, headers=auth(member["token"]))

    assert sent.status_code == 204, sent.text


def test_validation_fails_a_direct_upload_larger_than_declared(client, session, member) -> None:  # type: ignore[no-untyped-def]
    content = _photo()
    identifier = _register(client, member, len(content) - 1)
    _stored_directly(session, identifier, content, "image/jpeg")

    service.validate(session, UUID(identifier))
    session.flush()

    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    assert attachment.status == AttachmentStatus.FAILED.value
    assert attachment.failure_code == "ATTACHMENT_TOO_LARGE"


def test_the_media_job_fails_a_direct_upload_larger_than_declared(
    client, session, member, monkeypatch, audio_enabled
) -> None:  # type: ignore[no-untyped-def]
    content = VOICE.read_bytes()
    identifier = _register(client, member, len(content) - 1, "AUDIO")
    _stored_directly(session, identifier, content, "audio/ogg")
    called: list[Path] = []

    def processed(source: Path, directory: Path) -> audios.ProcessedAudio:
        called.append(source)
        raise AssertionError("an oversized original must never reach the processor")

    monkeypatch.setattr(audios, "process", processed)
    video_jobs.validate_audio(session, {"attachmentId": identifier})
    session.expire_all()

    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    assert attachment.status == AttachmentStatus.FAILED.value
    assert attachment.failure_code == "ATTACHMENT_TOO_LARGE"
    assert called == []


def test_the_media_job_accepts_an_honest_direct_upload(
    client, session, member, monkeypatch, audio_enabled
) -> None:  # type: ignore[no-untyped-def]
    content = VOICE.read_bytes()
    identifier = _register(client, member, len(content), "AUDIO")
    _stored_directly(session, identifier, content, "audio/ogg")

    def processed(source: Path, directory: Path) -> audios.ProcessedAudio:
        output = directory / "voice.m4a"
        output.write_bytes((VOICE.parent / "short.m4a").read_bytes())
        return audios.ProcessedAudio(output, output.stat().st_size, 1)

    monkeypatch.setattr(audios, "process", processed)
    video_jobs.validate_audio(session, {"attachmentId": identifier})
    session.expire_all()

    attachment = session.get(Attachment, UUID(identifier))
    assert attachment is not None
    assert attachment.status == AttachmentStatus.READY.value
