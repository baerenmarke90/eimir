"""PostgreSQL/HTTP acceptance tests for the M4-A shared Dashboard."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.attachments.binding import MemoryAttachment
from eimir.attachments.models import Attachment, AttachmentPayload, AttachmentStatus, MediaType
from eimir.authorization import PrivacyClass
from eimir.core.ids import new_id
from eimir.dashboard import service as dashboard_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.milestones.models import Milestone, MilestonePayload
from eimir.people.models import (
    DateRepeat,
    ImportantDate,
    ImportantDatePayload,
    ImportantDateType,
    PersonRelationship,
    RelatedPerson,
    RelatedPersonPayload,
)
from eimir.plans.models import Plan, PlanPayload, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.relationship.models import SpaceProfile
from eimir.wishes.models import Wish, WishPayload
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

FIXED_NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)


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
    }


def _resource(couple, owner_id, *, private: bool = False):  # type: ignore[no-untyped-def]
    return {
        "space_id": couple["space"].id,
        "owner_id": owner_id,
        "privacy_class": (
            PrivacyClass.OWNER_ONLY.value if private else PrivacyClass.SPACE_SHARED.value
        ),
    }


def _dashboard(client, couple):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(couple["token_a"]),
    )


def _freeze(monkeypatch, at: datetime = FIXED_NOW) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: at)


def _bind_ready_photo(session: Session, memory: Memory, name: str) -> Attachment:  # type: ignore[no-untyped-def]
    """Attach a READY photo to ``memory``, matching real ingest end state."""
    attachment = Attachment(
        space_id=memory.space_id,
        owner_id=memory.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.READY.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        ready_at=FIXED_NOW,
        payload=AttachmentPayload(original_name=name),
    )
    session.add(attachment)
    session.flush()
    session.add(MemoryAttachment(memory_id=memory.id, attachment_id=attachment.id, position=0))
    session.flush()
    return attachment


def test_dashboard_is_shared_only_and_private_no_store(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    shared_heart = HeartMoment(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2025, 8, 30),
        payload=HeartMomentPayload(text="Shared retrospective", emotion=HeartEmotion.LOVED),
    )
    private_heart = HeartMoment(
        **_resource(couple, couple["anna"].id, private=True),
        happened_on=date(2025, 8, 30),
        payload=HeartMomentPayload(text="Private retrospective", emotion=HeartEmotion.GRATEFUL),
    )
    private_person = RelatedPerson(
        **_resource(couple, couple["anna"].id, private=True),
        relationship=PersonRelationship.FRIEND.value,
        birthday=date(1904, 8, 31),
        birthday_year_known=False,
        payload=RelatedPersonPayload(display_name="Private birthday"),
    )
    foreign_memory = Memory(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2025, 8, 30),
        payload=MemoryPayload(title="Foreign memory", body="Must never appear"),
    )
    session.add_all([shared_heart, private_heart, private_person, foreign_memory])
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    body = response.json()

    assert body["space"]["spaceId"] == str(couple["space"].id)
    assert body["space"]["partner"] == {
        "id": str(couple["ben"].id),
        "displayName": "Ben",
    }
    assert body["retrospective"]["id"] == str(shared_heart.id)
    assert body["sharedStorySummary"] == {
        "memories": 0,
        "heartMoments": 1,
        "milestones": 0,
    }

    visible_ids = {
        item["id"] for section in (body["upcoming"], body["recentShared"]) for item in section
    }
    visible_ids.add(body["retrospective"]["id"])
    assert str(private_heart.id) not in visible_ids
    assert str(private_person.id) not in visible_ids
    assert str(foreign_memory.id) not in visible_ids
    assert set(body) == {
        "space",
        "relationshipDuration",
        "retrospective",
        "keepsake",
        "upcoming",
        "recentShared",
        "sharedStorySummary",
        "thinkingOfYouAvailableAt",
    }


def test_relationship_duration_uses_callers_calendar_day_and_can_be_disabled(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    couple["anna"].timezone = "Pacific/Honolulu"
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == couple["space"].id)
    ).scalar_one()
    profile.relationship_started_on = date(2026, 8, 29)
    profile.show_relationship_duration = True
    session.flush()

    _freeze(monkeypatch, datetime(2026, 8, 30, 0, 30, tzinfo=UTC))
    first = _dashboard(client, couple)
    assert first.status_code == 200
    assert first.json()["relationshipDuration"]["daysTogether"] == 0
    assert first.json()["relationshipDuration"]["startedOn"] == "2026-08-29"

    profile.show_relationship_duration = False
    session.flush()
    second = _dashboard(client, couple)
    assert second.status_code == 200
    assert second.json()["relationshipDuration"] is None


def test_retrospective_uses_exact_date_and_most_recent_prior_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    older = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2024, 8, 30),
        payload=MemoryPayload(title="Older", body="Older"),
    )
    expected = Milestone(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2025, 8, 30),
        payload=MilestonePayload(title="Expected"),
    )
    wrong_day = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2025, 8, 29),
        payload=MemoryPayload(title="Wrong day", body="Wrong day"),
    )
    private_same_day = HeartMoment(
        **_resource(couple, couple["anna"].id, private=True),
        happened_on=date(2025, 8, 30),
        payload=HeartMomentPayload(text="Private", emotion=HeartEmotion.SEEN),
    )
    session.add_all([older, expected, wrong_day, private_same_day])
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    retrospective = response.json()["retrospective"]
    assert retrospective["type"] == "MILESTONE"
    assert retrospective["id"] == str(expected.id)
    assert retrospective["occurredOn"] == "2025-08-30"


def test_keepsake_survives_recent_shared_crowded_by_non_memory_items(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Issue #790: the Keepsake must not depend on recentShared's top-N.

    recentShared caps every candidate type at SECTION_LIMIT and then keeps
    only the globally most recent SECTION_LIMIT items. A burst of newer
    non-memory activity can therefore push every visual memory out of
    recentShared entirely. The Keepsake searches memories in its own wider
    window, so it must still surface the real photo.
    """
    _freeze(monkeypatch)
    photo_memory = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 1, 1),
        payload=MemoryPayload(title="Anniversary trip", body="A whole photo album"),
    )
    photo_memory.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    session.add(photo_memory)
    session.flush()
    attachment = _bind_ready_photo(session, photo_memory, "trip.jpg")

    for i in range(dashboard_service.SECTION_LIMIT):
        wish = Wish(
            **_resource(couple, couple["anna"].id),
            payload=WishPayload(title=f"Newer wish {i}"),
        )
        wish.created_at = datetime(2026, 8, 1 + i, tzinfo=UTC)
        session.add(wish)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200, response.text
    body = response.json()

    # The crowding actually happened: the photo memory is nowhere in
    # recentShared, which would previously have hidden the Keepsake too.
    recent_ids = {item["id"] for item in body["recentShared"]}
    assert str(photo_memory.id) not in recent_ids
    assert len(body["recentShared"]) == dashboard_service.SECTION_LIMIT

    assert body["keepsake"]["id"] == str(photo_memory.id)
    assert body["keepsake"]["type"] == "MEMORY"
    assert body["keepsake"]["previewAttachmentId"] == str(attachment.id)


def test_keepsake_is_space_isolated(client, session: Session, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Memory is always SPACE_SHARED (no private variant), so the only
    isolation the Keepsake needs to prove is tenant/Space isolation: a photo
    memory in a foreign Space must never become this Space's Keepsake, even
    when it is the most recent readable-looking candidate.
    """
    _freeze(monkeypatch)
    shared_memory = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 1, 1),
        payload=MemoryPayload(title="Shared photo", body="Ours"),
    )
    foreign_memory = Memory(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=date(2026, 1, 1),
        payload=MemoryPayload(title="Foreign photo", body="Must never appear"),
    )
    session.add_all([shared_memory, foreign_memory])
    session.flush()

    # The foreign memory is the newest, so recency alone would pick it;
    # only the Space-isolated candidate must win.
    shared_memory.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    foreign_memory.created_at = datetime(2026, 1, 2, tzinfo=UTC)
    session.flush()

    shared_attachment = _bind_ready_photo(session, shared_memory, "shared.jpg")
    _bind_ready_photo(session, foreign_memory, "foreign.jpg")

    response = _dashboard(client, couple)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["keepsake"]["id"] == str(shared_memory.id)
    assert body["keepsake"]["previewAttachmentId"] == str(shared_attachment.id)


def test_keepsake_prefers_most_recent_memory_with_a_ready_attachment(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    newest_without_photo = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 1, 3),
        payload=MemoryPayload(title="Newest, text only", body="No photo yet"),
    )
    middle_pending_photo = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 1, 2),
        payload=MemoryPayload(title="Middle, photo still processing", body="Uploading"),
    )
    oldest_ready_photo = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 1, 1),
        payload=MemoryPayload(title="Oldest, ready photo", body="Our photo"),
    )
    session.add_all([newest_without_photo, middle_pending_photo, oldest_ready_photo])
    session.flush()
    newest_without_photo.created_at = datetime(2026, 1, 3, tzinfo=UTC)
    middle_pending_photo.created_at = datetime(2026, 1, 2, tzinfo=UTC)
    oldest_ready_photo.created_at = datetime(2026, 1, 1, tzinfo=UTC)
    session.flush()

    pending_attachment = Attachment(
        space_id=middle_pending_photo.space_id,
        owner_id=middle_pending_photo.owner_id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        status=AttachmentStatus.VALIDATING.value,
        media_type=MediaType.IMAGE.value,
        declared_mime_type="image/jpeg",
        declared_size=100,
        payload=AttachmentPayload(original_name="processing.jpg"),
    )
    session.add(pending_attachment)
    session.flush()
    session.add(
        MemoryAttachment(
            memory_id=middle_pending_photo.id,
            attachment_id=pending_attachment.id,
            position=0,
        )
    )
    ready_attachment = _bind_ready_photo(session, oldest_ready_photo, "ready.jpg")

    response = _dashboard(client, couple)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["keepsake"]["id"] == str(oldest_ready_photo.id)
    assert body["keepsake"]["previewAttachmentId"] == str(ready_attachment.id)


def test_upcoming_combines_existing_date_sources_in_deterministic_order(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == couple["space"].id)
    ).scalar_one()
    profile.relationship_started_on = date(2020, 9, 2)

    plan = Plan(
        **_resource(couple, couple["anna"].id),
        status=PlanStatus.PLANNED.value,
        planned_start=datetime(2026, 8, 30, 18, 0, tzinfo=UTC),
        payload=PlanPayload(title="Tonight"),
    )
    important = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2020, 8, 31),
        repeats=DateRepeat.ANNUALLY.value,
        payload=ImportantDatePayload(label="Tomorrow"),
    )
    birthday_id = new_id()
    birthday = RelatedPerson(
        id=birthday_id,
        **_resource(couple, couple["anna"].id),
        relationship=PersonRelationship.FRIEND.value,
        birthday=date(1904, 9, 1),
        birthday_year_known=False,
        payload=RelatedPersonPayload(display_name="Birthday"),
    )
    private_date = ImportantDate(
        **_resource(couple, couple["anna"].id, private=True),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.CUSTOM.value,
        date=date(2026, 8, 30),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="Private today"),
    )
    session.add_all([plan, important, birthday, private_date])
    session.flush()

    person_date = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=birthday_id,
        related_person_privacy_class=PrivacyClass.SPACE_SHARED.value,
        type=ImportantDateType.CUSTOM.value,
        date=date(2026, 8, 31),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="Person anniversary"),
    )
    session.add(person_date)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    # Only couple-level items appear: PLAN, IMPORTANT_DATE (related_person_id=None), ANNIVERSARY.
    # ImportantDates assigned to a RelatedPerson are excluded from Wir/Today
    # (#617). The birthday itself defaults to not shown (#617/#699 refined
    # rule); see test_upcoming_birthday_* below for the explicit opt-in path.
    assert [item["type"] for item in upcoming] == [
        "PLAN",
        "IMPORTANT_DATE",
        "ANNIVERSARY",
    ]
    assert str(birthday.id) not in {item["id"] for item in upcoming}
    assert str(person_date.id) not in {item["id"] for item in upcoming}
    assert str(private_date.id) not in {item["id"] for item in upcoming}


def test_upcoming_excludes_third_party_dates_from_couple_context(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)

    # 1. Shared plan + upcoming RelatedPerson birthday (dashboard visibility
    # left at its default of off): Plan can be primary context; the
    # birthday does not appear in upcoming unless explicitly opted in.
    plan = Plan(
        **_resource(couple, couple["anna"].id),
        status=PlanStatus.PLANNED.value,
        planned_start=datetime(2026, 9, 5, 19, 0, tzinfo=UTC),
        payload=PlanPayload(title="Our anniversary dinner"),
    )
    birthday_id = new_id()
    person = RelatedPerson(
        id=birthday_id,
        **_resource(couple, couple["anna"].id),
        relationship=PersonRelationship.FRIEND.value,
        birthday=date(1904, 9, 1),
        birthday_year_known=False,
        payload=RelatedPersonPayload(display_name="Birthday"),
    )
    person_date = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=birthday_id,
        related_person_privacy_class=PrivacyClass.SPACE_SHARED.value,
        type=ImportantDateType.CUSTOM.value,
        date=date(2026, 8, 31),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="Person anniversary"),
    )
    session.add_all([plan, person])
    session.flush()
    session.add(person_date)
    session.flush()

    res = _dashboard(client, couple)
    assert res.status_code == 200
    upcoming_items = res.json()["upcoming"]
    assert len(upcoming_items) == 1
    assert upcoming_items[0]["id"] == str(plan.id)
    assert upcoming_items[0]["type"] == "PLAN"

    # 2. Only third-party birthdays exist:
    # upcoming is empty -> no forced primary context.
    session.delete(plan)
    session.flush()

    res_empty = _dashboard(client, couple)
    assert res_empty.status_code == 200
    assert res_empty.json()["upcoming"] == []

    # 3. Own relationship anniversary: remains eligible
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == couple["space"].id)
    ).scalar_one()
    profile.relationship_started_on = date(2022, 9, 10)
    session.flush()

    res_anniversary = _dashboard(client, couple)
    assert res_anniversary.status_code == 200
    anniv_upcoming = res_anniversary.json()["upcoming"]
    assert len(anniv_upcoming) == 1
    assert anniv_upcoming[0]["type"] == "ANNIVERSARY"

    # 4. Couple-specific ImportantDate (related_person_id is None): remains eligible
    couple_date = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2026, 9, 8),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="First Apartment"),
    )
    session.add(couple_date)
    session.flush()

    res_couple_date = _dashboard(client, couple)
    assert res_couple_date.status_code == 200
    types = [item["type"] for item in res_couple_date.json()["upcoming"]]
    assert types == ["IMPORTANT_DATE", "ANNIVERSARY"]
    assert res_couple_date.json()["upcoming"][0]["id"] == str(couple_date.id)

    # 5. Private / foreign person or date data: no leaks. The foreign person
    # has Dashboard visibility explicitly enabled, so exclusion here can only
    # come from tenant isolation, not from the opt-in defaulting to off.
    foreign_person = RelatedPerson(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        relationship=PersonRelationship.FRIEND.value,
        birthday=date(1904, 9, 5),
        birthday_year_known=False,
        show_birthday_on_dashboard=True,
        payload=RelatedPersonPayload(display_name="Foreign Friend"),
    )
    foreign_date = ImportantDate(
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2026, 9, 7),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="Foreign Couple Date"),
    )
    session.add_all([foreign_person, foreign_date])
    session.flush()

    res_no_leaks = _dashboard(client, couple)
    assert res_no_leaks.status_code == 200
    ids = {item["id"] for item in res_no_leaks.json()["upcoming"]}
    assert str(foreign_person.id) not in ids
    assert str(foreign_date.id) not in ids


def _birthday_person(couple, *, owner_id, **overrides):  # type: ignore[no-untyped-def]
    fields = {
        **_resource(couple, owner_id),
        "relationship": PersonRelationship.FRIEND.value,
        "birthday": date(1904, 9, 1),
        "birthday_year_known": False,
        "payload": RelatedPersonPayload(display_name="Lisa"),
    }
    fields.update(overrides)
    return RelatedPerson(**fields)


def test_upcoming_birthday_default_off_is_excluded(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """#699 Finding 1: a newly created shared birthday does not appear
    until its owner explicitly opts it into the Dashboard."""
    _freeze(monkeypatch)
    person = _birthday_person(couple, owner_id=couple["anna"].id)
    session.add(person)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    assert response.json()["upcoming"] == []


def test_upcoming_birthday_enabled_and_shared_appears(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    person = _birthday_person(couple, owner_id=couple["anna"].id, show_birthday_on_dashboard=True)
    session.add(person)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    assert len(upcoming) == 1
    assert upcoming[0]["type"] == "BIRTHDAY"
    assert upcoming[0]["id"] == str(person.id)
    assert upcoming[0]["titleOrText"] == "Lisa"


def test_upcoming_birthday_enabled_but_owner_only_never_appears(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Enabling Dashboard visibility never overrides OWNER_ONLY privacy."""
    _freeze(monkeypatch)
    person = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        show_birthday_on_dashboard=True,
    )
    session.add(person)
    session.flush()

    anna_view = _dashboard(client, couple)
    assert anna_view.status_code == 200
    assert anna_view.json()["upcoming"] == []

    ben_view = client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(sign_in(session, couple["ben"])),
    )
    assert ben_view.status_code == 200
    assert ben_view.json()["upcoming"] == []


def test_upcoming_birthday_owner_only_partner_view_has_no_side_channel(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """The partner's Dashboard must not reveal a private birthday exists,
    even through count/order/section-presence side channels."""
    _freeze(monkeypatch)
    private_person = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        show_birthday_on_dashboard=True,
    )
    shared_plan = Plan(
        **_resource(couple, couple["anna"].id),
        status=PlanStatus.PLANNED.value,
        planned_start=datetime(2026, 9, 5, 19, 0, tzinfo=UTC),
        payload=PlanPayload(title="Shared plan"),
    )
    session.add_all([private_person, shared_plan])
    session.flush()

    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/dashboard",
        headers=auth(sign_in(session, couple["ben"])),
    )
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    # Only the shared plan is visible; the private birthday influences
    # neither count nor presence.
    assert len(upcoming) == 1
    assert upcoming[0]["id"] == str(shared_plan.id)


def test_upcoming_birthday_disabled_shared_does_not_influence_order_or_count(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    disabled_person = _birthday_person(
        couple, owner_id=couple["anna"].id, show_birthday_on_dashboard=False
    )
    plan = Plan(
        **_resource(couple, couple["anna"].id),
        status=PlanStatus.PLANNED.value,
        planned_start=datetime(2026, 8, 30, 18, 0, tzinfo=UTC),
        payload=PlanPayload(title="Tonight"),
    )
    session.add_all([disabled_person, plan])
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    assert len(upcoming) == 1
    assert upcoming[0]["type"] == "PLAN"


def test_upcoming_birthday_visible_to_both_partners(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    person = _birthday_person(couple, owner_id=couple["anna"].id, show_birthday_on_dashboard=True)
    session.add(person)
    session.flush()

    for token in (couple["token_a"], sign_in(session, couple["ben"])):
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}/dashboard",
            headers=auth(token),
        )
        assert response.status_code == 200
        upcoming = response.json()["upcoming"]
        assert len(upcoming) == 1
        assert upcoming[0]["type"] == "BIRTHDAY"
        assert upcoming[0]["id"] == str(person.id)


def test_upcoming_birthday_deterministic_ordering_with_other_sources(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """next occurrence ASC, then type, then stable ID - unchanged by adding
    a birthday source into the same candidate pool."""
    _freeze(monkeypatch)
    plan = Plan(
        **_resource(couple, couple["anna"].id),
        status=PlanStatus.PLANNED.value,
        planned_start=datetime(2026, 8, 31, 10, 0, tzinfo=UTC),
        payload=PlanPayload(title="Early plan"),
    )
    important = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.CUSTOM.value,
        date=date(2026, 9, 2),
        repeats=DateRepeat.NONE.value,
        payload=ImportantDatePayload(label="Mid date"),
    )
    person = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        birthday=date(1904, 9, 2),
        show_birthday_on_dashboard=True,
    )
    session.add_all([plan, important, person])
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    # Plan (Aug 31) first; then Sep 2 tie between IMPORTANT_DATE and BIRTHDAY,
    # broken by type name ASC ("BIRTHDAY" < "IMPORTANT_DATE").
    assert [item["type"] for item in upcoming] == ["PLAN", "BIRTHDAY", "IMPORTANT_DATE"]


def test_upcoming_birthday_feb29_resolves_to_feb28_in_non_leap_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch, datetime(2027, 1, 15, 12, 0, tzinfo=UTC))
    person = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        birthday=date(1904, 2, 29),
        show_birthday_on_dashboard=True,
    )
    session.add(person)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    assert len(upcoming) == 1
    assert upcoming[0]["occurredOn"] == "2027-02-28"


def test_upcoming_birthday_feb29_stays_feb29_in_leap_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch, datetime(2028, 1, 15, 12, 0, tzinfo=UTC))
    person = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        birthday=date(1904, 2, 29),
        show_birthday_on_dashboard=True,
    )
    session.add(person)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = response.json()["upcoming"]
    assert len(upcoming) == 1
    assert upcoming[0]["occurredOn"] == "2028-02-29"


def test_upcoming_birthday_known_year_is_never_exposed_beyond_next_occurrence(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """birthdayYearKnown semantics: `occurredOn` carries only the next
    occurrence year, never the real birth year, whether known or not."""
    _freeze(monkeypatch, datetime(2026, 9, 1, 12, 0, tzinfo=UTC))
    known = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        birthday=date(1990, 9, 10),
        birthday_year_known=True,
        show_birthday_on_dashboard=True,
        payload=RelatedPersonPayload(display_name="Known year"),
    )
    unknown = _birthday_person(
        couple,
        owner_id=couple["anna"].id,
        birthday=date(1904, 9, 20),
        birthday_year_known=False,
        show_birthday_on_dashboard=True,
        payload=RelatedPersonPayload(display_name="Unknown year"),
    )
    session.add_all([known, unknown])
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    upcoming = {item["id"]: item for item in response.json()["upcoming"]}
    # Neither the real birth year (1990) nor the placeholder (1904) leaks:
    # both occurrences land in the current caller-local year, 2026.
    assert upcoming[str(known.id)]["occurredOn"] == "2026-09-10"
    assert upcoming[str(unknown.id)]["occurredOn"] == "2026-09-20"


def test_upcoming_important_date_annual_feb29_resolves_to_feb28_in_non_leap_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Issue #699: Feb-29 annual recurrence must resolve to Feb-28 rather than
    skipping non-leap years until the next leap year."""
    _freeze(monkeypatch, datetime(2027, 1, 15, 12, 0, tzinfo=UTC))
    important = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2020, 2, 29),
        repeats=DateRepeat.ANNUALLY.value,
        payload=ImportantDatePayload(label="Leap day anniversary"),
    )
    session.add(important)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    item = next(entry for entry in response.json()["upcoming"] if entry["id"] == str(important.id))
    assert item["occurredOn"] == "2027-02-28"


def test_upcoming_important_date_annual_feb29_stays_feb29_in_leap_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch, datetime(2028, 1, 15, 12, 0, tzinfo=UTC))
    important = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2020, 2, 29),
        repeats=DateRepeat.ANNUALLY.value,
        payload=ImportantDatePayload(label="Leap day anniversary"),
    )
    session.add(important)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    item = next(entry for entry in response.json()["upcoming"] if entry["id"] == str(important.id))
    assert item["occurredOn"] == "2028-02-29"


def test_upcoming_relationship_anniversary_feb29_resolves_to_feb28_in_non_leap_year(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch, datetime(2027, 1, 15, 12, 0, tzinfo=UTC))
    profile = session.execute(
        select(SpaceProfile).where(SpaceProfile.space_id == couple["space"].id)
    ).scalar_one()
    profile.relationship_started_on = date(2020, 2, 29)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    anniversary = next(
        entry for entry in response.json()["upcoming"] if entry["type"] == "ANNIVERSARY"
    )
    assert anniversary["occurredOn"] == "2027-02-28"


def test_upcoming_annual_occurrence_boundary_before_and_after(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """The caller's timezone-derived `today` decides which side of the
    boundary an annual occurrence falls on."""
    important = ImportantDate(
        **_resource(couple, couple["anna"].id),
        related_person_id=None,
        related_person_privacy_class=None,
        type=ImportantDateType.ANNIVERSARY.value,
        date=date(2020, 6, 15),
        repeats=DateRepeat.ANNUALLY.value,
        payload=ImportantDatePayload(label="Mid-year anniversary"),
    )
    session.add(important)
    session.flush()

    _freeze(monkeypatch, datetime(2026, 6, 14, 12, 0, tzinfo=UTC))
    before = _dashboard(client, couple)
    assert before.status_code == 200
    item = next(e for e in before.json()["upcoming"] if e["id"] == str(important.id))
    assert item["occurredOn"] == "2026-06-15"

    _freeze(monkeypatch, datetime(2026, 6, 16, 12, 0, tzinfo=UTC))
    after = _dashboard(client, couple)
    assert after.status_code == 200
    item = next(e for e in after.json()["upcoming"] if e["id"] == str(important.id))
    assert item["occurredOn"] == "2027-06-15"


def test_recognition_fields_are_bounded(client, session: Session, couple, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _freeze(monkeypatch)
    memory = Memory(
        **_resource(couple, couple["anna"].id),
        happened_on=date(2026, 8, 30),
        payload=MemoryPayload(title="x" * 300, body="Body stays out of Dashboard"),
    )
    session.add(memory)
    session.flush()

    response = _dashboard(client, couple)
    assert response.status_code == 200
    item = next(entry for entry in response.json()["recentShared"] if entry["id"] == str(memory.id))
    assert item["titleOrText"] == "x" * dashboard_service.MAX_RECOGNITION_TEXT
    assert "Body stays out" not in response.text


def test_thinking_of_you_available_at_reflects_server_authoritative_cooldown(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    """Issue #790/#791: the client must be able to reconcile the Thinking-of-
    you control's cooldown state from the Dashboard read model alone (e.g. on
    page load), rather than a local timer or a failed send.
    """
    current = {"value": FIXED_NOW}
    monkeypatch.setattr(dashboard_service.clock, "now", lambda: current["value"])

    before_send = _dashboard(client, couple)
    assert before_send.status_code == 200
    assert before_send.json()["thinkingOfYouAvailableAt"] is None

    sent = client.post(
        f"/api/v1/spaces/{couple['space'].id}/thinking-of-you",
        json={"clientRequestId": str(new_id())},
        headers=auth(couple["token_a"]),
    )
    assert sent.status_code == 202

    during_cooldown = _dashboard(client, couple)
    assert during_cooldown.status_code == 200
    raw_available_at = during_cooldown.json()["thinkingOfYouAvailableAt"]
    assert raw_available_at is not None
    parsed_available_at = datetime.fromisoformat(raw_available_at.replace("Z", "+00:00"))
    assert parsed_available_at == current["value"] + timedelta(minutes=30)

    current["value"] = current["value"] + timedelta(minutes=30, seconds=1)
    after_cooldown = _dashboard(client, couple)
    assert after_cooldown.status_code == 200
    assert after_cooldown.json()["thinkingOfYouAvailableAt"] is None
