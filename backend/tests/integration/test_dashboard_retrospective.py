"""Integration acceptance for the existing #452 Today retrospective projection."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.dashboard import service as dashboard_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
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
    }


def _freeze(monkeypatch, day: date) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(
        dashboard_service.clock,
        "now",
        lambda: datetime(day.year, day.month, day.day, 12, tzinfo=UTC),
    )


def _fallback_day(space_id) -> date:  # type: ignore[no-untyped-def]
    start = date(2026, 10, 23)
    return start + timedelta(days=(space_id.int % 7 - start.weekday()) % 7)


def _dashboard(client, couple, token):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(token),
    )


def _memory(couple, title: str, day: date | None, *, owner=None, space=None):  # type: ignore[no-untyped-def]
    return Memory(
        space_id=space or couple["space"].id,
        owner_id=owner or couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=day,
        payload=MemoryPayload(title=title, body=""),
    )


def _photo(session: Session, memory: Memory, *, ready: bool) -> Attachment:
    attachment = Attachment(
        space_id=memory.space_id,
        owner_id=memory.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=(AttachmentStatus.READY if ready else AttachmentStatus.PENDING).value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        payload=AttachmentPayload(original_name="history.jpg"),
    )
    session.add(attachment)
    session.flush()
    session.add(
        MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=0)
    )
    session.flush()
    return attachment


def test_anniversary_precedes_older_history_and_is_stable_for_both_partners(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    day = date(2026, 10, 23)
    _freeze(monkeypatch, day)
    early = _memory(couple, "Our first memory", date(2020, 4, 5))
    prior_annual = Milestone(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2024, 10, 23),
        payload=MilestonePayload(title="Older anniversary"),
    )
    one_year = _memory(couple, "One year ago", date(2025, 10, 23))
    session.add_all([early, prior_annual, one_year])
    session.flush()

    for token in (couple["token_a"], couple["token_b"]):
        response = _dashboard(client, couple, token)
        assert response.status_code == 200, response.text
        assert response.json()["retrospective"]["id"] == str(one_year.id)
        assert response.json()["retrospective"]["occurredOn"] == "2025-10-23"


def test_quiet_fallback_returns_earliest_event_only_once_each_space_week(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    first = _memory(couple, "First shared day", date(2020, 3, 1))
    later = _memory(couple, "Another shared day", date(2023, 4, 2))
    session.add_all([later, first])
    session.flush()
    chosen_day = _fallback_day(couple["space"].id)
    _freeze(monkeypatch, chosen_day)

    for token in (couple["token_a"], couple["token_b"], couple["token_a"]):
        response = _dashboard(client, couple, token)
        assert response.status_code == 200, response.text
        assert response.headers["cache-control"] == "private, no-store"
        assert response.json()["retrospective"]["id"] == str(first.id)
        assert response.json()["retrospective"]["type"] == "MEMORY"

    _freeze(monkeypatch, chosen_day + timedelta(days=1))
    off_day = _dashboard(client, couple, couple["token_a"])
    assert off_day.status_code == 200, off_day.text
    assert off_day.json()["retrospective"] is None


def test_no_recent_or_future_event_can_become_early_memory_fallback(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    day = _fallback_day(couple["space"].id)
    _freeze(monkeypatch, day)
    newest = _memory(couple, "Too new", day - timedelta(days=30))
    future = _memory(couple, "Not yet happened", day + timedelta(days=1))
    session.add_all([newest, future])
    session.flush()
    assert _dashboard(client, couple, couple["token_a"]).json()["retrospective"] is None

    older = _memory(couple, "Past memory", day - timedelta(days=31))
    session.add(older)
    session.flush()
    assert _dashboard(client, couple, couple["token_a"]).json()["retrospective"]["id"] == str(
        older.id
    )


def test_fallback_excludes_private_partner_and_foreign_space_content(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    day = _fallback_day(couple["space"].id)
    _freeze(monkeypatch, day)
    eligible = _memory(couple, "Visible to both", date(2024, 1, 1))
    foreign = _memory(
        couple,
        "Foreign", date(2019, 1, 1),
        owner=couple["outsider"].id,
        space=couple["foreign_space"].id,
    )
    private_heart = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=day.replace(year=2025),
        payload=HeartMomentPayload(text="Private", emotion=HeartEmotion.SEEN),
    )
    session.add_all([eligible, foreign, private_heart])
    session.flush()

    for token in (couple["token_a"], couple["token_b"]):
        response = _dashboard(client, couple, token)
        assert response.status_code == 200, response.text
        assert response.json()["retrospective"]["id"] == str(eligible.id)

    session.delete(eligible)
    session.flush()
    for token in (couple["token_a"], couple["token_b"]):
        assert _dashboard(client, couple, token).json()["retrospective"] is None


def test_undated_memory_uses_creation_day_in_viewer_timezone_for_anniversary(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    # The UTC calendar date is Aug 31, but the reader in Honolulu has Aug 30.
    couple["anna"].timezone = "Pacific/Honolulu"
    memory = _memory(couple, "Undated memory", None)
    session.add(memory)
    session.flush()
    memory.created_at = datetime(2025, 8, 31, 0, 30, tzinfo=UTC)
    session.flush()
    _freeze(monkeypatch, date(2026, 8, 30))

    response = _dashboard(client, couple, couple["token_a"])
    assert response.status_code == 200, response.text
    actual = response.json()["retrospective"]
    assert actual["id"] == str(memory.id)
    assert actual["occurredOn"] is None
    assert actual["createdAt"].startswith("2025-08-31T00:30:00")


def test_fallback_prefers_event_date_to_later_upload_date_and_uses_ready_photo_only(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    day = _fallback_day(couple["space"].id)
    _freeze(monkeypatch, day)
    early_event = _memory(couple, "Early event", date(2020, 4, 1))
    later_event = _memory(couple, "Later event", date(2021, 4, 2))
    session.add_all([early_event, later_event])
    session.flush()
    early_event.created_at = datetime(2025, 10, 1, tzinfo=UTC)
    later_event.created_at = datetime(2024, 10, 1, tzinfo=UTC)
    session.flush()
    pending = _photo(session, early_event, ready=False)

    first = _dashboard(client, couple, couple["token_a"])
    assert first.status_code == 200
    assert first.json()["retrospective"]["id"] == str(early_event.id)
    assert first.json()["retrospective"]["previewAttachmentId"] is None

    pending.status = AttachmentStatus.READY.value
    session.flush()
    ready = _dashboard(client, couple, couple["token_a"])
    assert ready.status_code == 200
    assert ready.json()["retrospective"]["id"] == str(early_event.id)
    assert ready.json()["retrospective"]["previewAttachmentId"] == str(pending.id)
