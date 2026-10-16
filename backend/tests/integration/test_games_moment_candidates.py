"""HTTP/PostgreSQL acceptance tests for #863 Slice A candidate reads."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.games.service import MAX_MEMORY_CANDIDATES
from eimir.memories.models import Memory, MemoryPayload
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


def _grant_games(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()


def _memory(
    session: Session,
    *,
    space_id,
    owner_id,
    title: str,
    happened_on: date | None = date(2025, 6, 13),
) -> Memory:  # type: ignore[no-untyped-def]
    memory = Memory(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=happened_on,
        payload=MemoryPayload(title=title, body="Body"),
    )
    session.add(memory)
    session.flush()
    return memory


def _bind_media(
    session: Session,
    memory: Memory,
    *,
    name: str,
    position: int = 0,
    status: AttachmentStatus = AttachmentStatus.READY,
    media_type: MediaType = MediaType.IMAGE,
) -> Attachment:
    mime_type = "image/jpeg" if media_type is MediaType.IMAGE else "video/mp4"
    attachment = Attachment(
        space_id=memory.space_id,
        owner_id=memory.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=status.value,
        media_type=media_type.value,
        declared_mime_type=mime_type,
        declared_size=100,
        mime_type=mime_type if status is AttachmentStatus.READY else None,
        size=100 if status is AttachmentStatus.READY else None,
        width=1200 if media_type is MediaType.IMAGE and status is AttachmentStatus.READY else None,
        height=800 if media_type is MediaType.IMAGE and status is AttachmentStatus.READY else None,
        ready_at=now() if status is AttachmentStatus.READY else None,
        payload=AttachmentPayload(original_name=name),
    )
    session.add(attachment)
    session.flush()
    session.add(
        MemoryAttachment(
            memory_id=memory.id,
            attachment_id=attachment.id,
            position=position,
        )
    )
    session.flush()
    return attachment


def _candidates(client, couple, *, token=None, space_id=None):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{space_id or couple['space'].id}/games/moments/candidates",
        headers=auth(token or couple["token_a"]),
    )


def test_candidates_require_server_authoritative_games_capability(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    memory = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Must stay behind Premium",
    )
    _bind_media(session, memory, name="premium.jpg")

    response = _candidates(client, couple)

    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert "Must stay behind Premium" not in response.text


def test_candidates_return_only_usable_shared_ready_photo_memories(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)

    eligible = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Amsterdam",
        happened_on=date(2025, 6, 13),
    )
    later_image = _bind_media(session, eligible, name="later.jpg", position=1)
    first_image = _bind_media(session, eligible, name="first.jpg", position=0)

    fallback_date = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        title="Ohne Datum",
        happened_on=None,
    )
    fallback_image = _bind_media(session, fallback_date, name="fallback.jpg")

    _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Nur Text",
    )
    video_only = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Nur Video",
    )
    _bind_media(session, video_only, name="clip.mp4", media_type=MediaType.VIDEO)

    processing_image = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Noch nicht bereit",
    )
    _bind_media(
        session,
        processing_image,
        name="processing.jpg",
        status=AttachmentStatus.VALIDATING,
    )

    blank_title = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="   ",
    )
    _bind_media(session, blank_title, name="blank.jpg")

    foreign = _memory(
        session,
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        title="Foreign",
    )
    _bind_media(session, foreign, name="foreign.jpg")

    response = _candidates(client, couple)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    assert len(body["items"]) == 2

    items = {item["memoryId"]: item for item in body["items"]}
    assert set(items) == {str(eligible.id), str(fallback_date.id)}
    assert set(items[str(eligible.id)]) == {
        "memoryId",
        "title",
        "effectiveDate",
        "imageAttachmentId",
    }
    assert items[str(eligible.id)] == {
        "memoryId": str(eligible.id),
        "title": "Amsterdam",
        "effectiveDate": "2025-06-13",
        "imageAttachmentId": str(first_image.id),
    }
    assert items[str(eligible.id)]["imageAttachmentId"] != str(later_image.id)
    assert items[str(fallback_date.id)]["imageAttachmentId"] == str(fallback_image.id)
    expected_fallback_date = fallback_date.created_at.date().isoformat()
    assert items[str(fallback_date.id)]["effectiveDate"] == expected_fallback_date


def test_candidate_set_is_identical_for_both_partners_and_tenant_guarded(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    memory = _memory(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Shared history",
    )
    _bind_media(session, memory, name="shared.jpg")

    anna = _candidates(client, couple, token=couple["token_a"])
    ben = _candidates(client, couple, token=couple["token_b"])
    outsider = _candidates(client, couple, token=couple["token_outsider"])

    assert anna.status_code == 200
    assert ben.status_code == 200
    assert anna.json() == ben.json()
    assert outsider.status_code == 404
    assert outsider.json()["code"] == "SPACE_NOT_FOUND"


def test_candidate_scan_is_not_limited_to_one_story_sized_page(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)

    expected: set[str] = set()
    for index in range(3):
        memory = _memory(
            session,
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            title=f"Playable {index}",
        )
        _bind_media(session, memory, name=f"playable-{index}.jpg")
        expected.add(str(memory.id))

    # These are newer and therefore scanned first. A naive implementation that
    # inspected only one bounded Story-like page before filtering titles would
    # incorrectly report a sparse set and never reach the valid older rows.
    for index in range(MAX_MEMORY_CANDIDATES + 6):
        memory = _memory(
            session,
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            title="   ",
        )
        _bind_media(session, memory, name=f"blank-{index}.jpg")

    response = _candidates(client, couple)
    assert response.status_code == 200, response.text
    assert {item["memoryId"] for item in response.json()["items"]} == expected


def test_candidate_pool_is_bounded_without_exposing_a_total(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    for index in range(MAX_MEMORY_CANDIDATES + 5):
        memory = _memory(
            session,
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            title=f"Memory {index}",
        )
        _bind_media(session, memory, name=f"memory-{index}.jpg")

    response = _candidates(client, couple)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    assert len(body["items"]) == MAX_MEMORY_CANDIDATES
    assert "total" not in body
    assert "count" not in body
