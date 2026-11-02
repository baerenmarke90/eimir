"""Playback grants never replace session, membership or parent authorization."""

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, PlaybackGrant
from eimir.auth import sessions
from eimir.core.clock import now
from eimir.media import get_media_store
from eimir.memories.models import Memory, MemoryPayload
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def video(session):  # type: ignore[no-untyped-def]
    import io

    from eimir.attachments import service

    account = make_account(session, "Video owner")
    space = make_space(session, account)
    token = sign_in(session, account)
    memory = Memory(
        space_id=space.id, author_id=account.id, payload=MemoryPayload(title="A video", body="")
    )
    attachment = Attachment(
        space_id=space.id,
        owner_id=account.id,
        privacy_class="OWNER_ONLY",
        status="READY",
        media_type="VIDEO",
        declared_mime_type="video/mp4",
        declared_size=10,
        mime_type="video/mp4",
        size=10,
        width=96,
        height=64,
        duration_seconds=1,
        ready_at=now(),
        payload=AttachmentPayload(original_name="video.mp4"),
    )
    session.add_all([memory, attachment])
    session.flush()
    session.add(MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=0))
    session.flush()
    get_media_store().put(
        service.storage_key_for(attachment), io.BytesIO(b"0123456789"), "video/mp4"
    )
    return account, space, token, memory, attachment


def issue(client, video):  # type: ignore[no-untyped-def]
    _, space, token, memory, attachment = video
    result = client.post(
        f"/api/v1/spaces/{space.id}/attachments/{attachment.id}/playback-access",
        json={"parentType": "MEMORY", "parentId": str(memory.id)},
        headers=auth(token),
    )
    assert result.status_code == 200, result.text
    return result.json()["url"]


def test_grant_streams_ranges_without_a_general_bearer_and_is_hashed(client, session, video):  # type: ignore[no-untyped-def]
    from urllib.parse import parse_qs, urlsplit

    url = issue(client, video)
    result = client.get(url, headers={"Range": "bytes=2-5"})
    assert result.status_code == 206
    assert result.content == b"2345"
    row = session.scalars(select(PlaybackGrant)).one()
    plain = parse_qs(urlsplit(url).query)["token"][0]
    assert row.token_hash != plain
    assert client.get("/api/v1/account", headers=auth(plain)).status_code == 401


def test_grant_cannot_change_attachment_or_space(client, video):  # type: ignore[no-untyped-def]
    url = issue(client, video)
    for identifier in [video[1].id, video[4].id]:
        assert client.get(url.replace(str(identifier), str(uuid4()))).status_code == 404


def test_session_revocation_blocks_further_ranges(client, session, video):  # type: ignore[no-untyped-def]
    url = issue(client, video)
    device, _ = sessions.resolve(session, video[2])
    sessions.revoke(device)
    session.flush()
    assert client.get(url).status_code == 401


def test_expired_grant_and_deleted_parent_are_not_readable(client, session, video):  # type: ignore[no-untyped-def]
    url = issue(client, video)
    grant = session.scalars(select(PlaybackGrant)).one()
    grant.expires_at = now() - timedelta(seconds=1)
    session.flush()
    assert client.get(url).status_code == 404
    grant.expires_at = now() + timedelta(minutes=1)
    session.delete(video[3])
    session.flush()
    assert client.get(url).status_code == 404
