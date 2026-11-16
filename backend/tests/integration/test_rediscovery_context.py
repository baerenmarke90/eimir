"""Integration acceptance for the rediscovery wording context (#1790 C2).

The context lets the Wir and Momente rediscovery cards vary their wording.
These tests pin its privacy contract: only couple-shared, viewer-readable
sources produce facts, the body is reduced to its first words, sensitive
photos never contribute a capture time, and foreign viewers get nothing.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.chapters.models import Chapter, ChapterPayload
from eimir.dashboard import service as dashboard_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.places.models import Place, PlacePayload
from eimir.relations.models import ChapterMemory, PlaceMemory
from eimir.relationship import service as relationship_service
from eimir.story.rediscovery import PartOfDay, RediscoveryKind, rediscovery_context
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

TODAY = date(2026, 11, 13)
ONE_YEAR_AGO = date(2025, 11, 13)


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
    }


def _freeze(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        dashboard_service.clock,
        "now",
        lambda: datetime(TODAY.year, TODAY.month, TODAY.day, 12, tzinfo=UTC),
    )


def _attach(  # type: ignore[no-untyped-def]
    session: Session,
    memory: Memory,
    position: int,
    *,
    media_type: MediaType = MediaType.IMAGE,
    status: AttachmentStatus = AttachmentStatus.READY,
    captured_at: datetime | None = None,
    sensitive: bool = False,
) -> None:
    attachment = Attachment(
        space_id=memory.space_id,
        owner_id=memory.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=status.value,
        media_type=media_type.value,
        declared_mime_type="video/mp4" if media_type is MediaType.VIDEO else "image/jpeg",
        declared_size=100,
        ready_at=datetime(2025, 11, 14, tzinfo=UTC) if status is AttachmentStatus.READY else None,
        payload=AttachmentPayload(
            original_name=f"media-{position}",
            captured_at=captured_at,
            is_sensitive=sensitive,
        ),
    )
    session.add(attachment)
    session.flush()
    session.add(
        MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=position)
    )


def _rich_memory(session: Session, couple) -> Memory:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    anna_id = couple["anna"].id
    memory = Memory(
        space_id=space_id,
        owner_id=anna_id,
        # Memories are couple-shared by schema constraint.
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=ONE_YEAR_AGO,
        payload=MemoryPayload(
            title="",
            body="Wir sind einfach losgefahren, ohne Plan und ohne Uhr, bis zum Wasser.",
            tags=["Sonnenuntergang", "Wochenende"],
        ),
    )
    shared = {"space_id": space_id, "owner_id": anna_id, "privacy_class": "SPACE_SHARED"}
    place = Place(**shared, payload=PlacePayload(name="Phoenix-See"))
    chapter = Chapter(**shared, payload=ChapterPayload(title="Sommerurlaub"))
    session.add_all([memory, place, chapter])
    session.flush()
    session.add_all(
        [
            PlaceMemory(
                space_id=space_id, created_by=anna_id, memory_id=memory.id, place_id=place.id
            ),
            ChapterMemory(
                space_id=space_id, created_by=anna_id, memory_id=memory.id, chapter_id=chapter.id
            ),
        ]
    )
    # Sensitive photo first: its morning capture time must not be used.
    _attach(session, memory, 0, captured_at=datetime(2025, 11, 13, 9, 0), sensitive=True)
    _attach(session, memory, 1, captured_at=datetime(2025, 11, 13, 15, 30))
    _attach(session, memory, 2, captured_at=datetime(2025, 11, 13, 16, 0))
    _attach(session, memory, 3, media_type=MediaType.VIDEO)
    _attach(session, memory, 4, status=AttachmentStatus.PENDING)
    session.flush()
    return memory


def test_shared_memory_exposes_bounded_wording_facts_to_both_partners(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    memory = _rich_memory(session, couple)

    for token in (couple["token_a"], couple["token_b"]):
        response = client.get(f"/api/v1/spaces/{couple['space'].id}/dashboard", headers=auth(token))
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["retrospective"]["id"] == str(memory.id)
        assert body["retrospectiveRediscovery"] == {
            "placeName": "Phoenix-See",
            "chapterTitle": "Sommerurlaub",
            "tag": "Sonnenuntergang",
            "excerpt": "Wir sind einfach losgefahren, ohne Plan und ohne",
            "excerptTruncated": True,
            "photoCount": 3,
            "videoCount": 1,
            "partOfDay": PartOfDay.AFTERNOON.value,
        }


def test_unreadable_or_foreign_viewer_gets_no_context(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    memory = _rich_memory(session, couple)
    # An authorization context is only ever issued for a verified membership,
    # so a foreign viewer reads from their own Space.
    outsider = AuthorizationContext(
        account_id=couple["outsider"].id, space_id=couple["foreign_space"].id
    )
    partner = AuthorizationContext(account_id=couple["ben"].id, space_id=couple["space"].id)

    assert rediscovery_context(session, outsider, RediscoveryKind.MEMORY, memory.id) is None
    context = rediscovery_context(session, partner, RediscoveryKind.MEMORY, memory.id)
    assert context is not None
    assert context.place_name == "Phoenix-See"


def test_private_heart_moment_produces_no_context_for_its_owner(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    private = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=ONE_YEAR_AGO,
        payload=HeartMomentPayload(text="Nur für mich", emotion=HeartEmotion.LOVED),
    )
    session.add(private)
    session.flush()
    owner = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)

    assert rediscovery_context(session, owner, RediscoveryKind.HEART_MOMENT, private.id) is None


def test_shared_heart_moment_counts_its_gallery_without_text_excerpt(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    shared = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=ONE_YEAR_AGO,
        payload=HeartMomentPayload(text="Danke für heute", emotion=HeartEmotion.GRATEFUL),
    )
    session.add(shared)
    session.flush()
    partner = AuthorizationContext(account_id=couple["ben"].id, space_id=couple["space"].id)

    context = rediscovery_context(session, partner, RediscoveryKind.HEART_MOMENT, shared.id)
    assert context is not None
    # The quote itself is already the card's content; it is not duplicated.
    assert context.excerpt is None
    assert context.tag is None
    assert context.photo_count == 0
