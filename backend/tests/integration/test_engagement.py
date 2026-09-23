"""PostgreSQL/HTTP evidence for M4-B Activity and in-app Notifications."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, ContentVisibility, PrivacyClass
from eimir.collections.models import Collection, CollectionPayload
from eimir.comments import service as comment_service
from eimir.comments.models import CommentTarget
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.engagement import service
from eimir.engagement.models import Activity, ActivityKind, Notification, NotificationKind
from eimir.heart_moments.models import HeartEmotion, HeartMoment, HeartMomentPayload
from eimir.memories.models import Memory, MemoryPayload
from eimir.outbox import service as outbox_service
from eimir.outbox.models import OutboxEvent
from eimir.places.models import Place, PlacePayload
from eimir.plans.models import Plan, PlanPayload, PlanStatus
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishPayload
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

NOW = datetime(2026, 8, 30, 12, 0, tzinfo=UTC)


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
        "anna_token": sign_in(session, anna),
        "ben_token": sign_in(session, ben),
        "outsider_token": sign_in(session, outsider),
    }


def _shared_memory(session: Session, couple, *, owner=None, title: str = "Memory"):  # type: ignore[no-untyped-def]
    owner = owner or couple["anna"]
    memory = Memory(
        space_id=couple["space"].id,
        owner_id=owner.id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=MemoryPayload(title=title, body="Protected body"),
    )
    session.add(memory)
    session.flush()
    return memory


def _event(
    session: Session,
    couple,
    event_type: EventType,
    subject,
    *,
    actor=None,
    payload: PublicEventPayload | None = None,
) -> OutboxEvent:  # type: ignore[no-untyped-def]
    actor = actor or couple["anna"]
    outbox_service.record(
        session,
        DomainEvent(
            type=event_type,
            space_id=couple["space"].id,
            actor_id=actor.id,
            subject_type=subject.__class__.__name__.upper(),
            subject_id=subject.id,
            resource_version=getattr(subject, "version", None),
            payload=payload or PublicEventPayload(),
        ),
    )
    session.flush()
    return session.execute(
        select(OutboxEvent)
        .where(
            OutboxEvent.event_type == event_type.value,
            OutboxEvent.subject_id == subject.id,
        )
        .order_by(OutboxEvent.created_at.desc(), OutboxEvent.id.desc())
        .limit(1)
    ).scalar_one()


def test_projection_replay_is_idempotent_and_copies_no_protected_text(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple, title="Recognition only")
    event = _event(session, couple, EventType.MEMORY_CREATED, memory)

    service.project_event(session, event)
    service.project_event(session, event)
    session.flush()

    rows = (
        session.execute(select(Activity).where(Activity.source_event_id == event.id))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    activity = rows[0]
    assert activity.kind == ActivityKind.MEMORY_CREATED.value
    assert activity.target_id == memory.id
    assert not hasattr(activity, "payload")
    assert not hasattr(activity, "title")
    assert not hasattr(activity, "body")


def test_private_heart_moment_never_projects_activity(session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    heart_moment = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="Private text", emotion=HeartEmotion.LOVED),
    )
    session.add(heart_moment)
    session.flush()
    event = _event(
        session,
        couple,
        EventType.HEART_MOMENT_CREATED,
        heart_moment,
        payload=PublicEventPayload(visibility=ContentVisibility.PRIVATE),
    )

    service.project_event(session, event)
    session.flush()

    count = session.execute(
        select(func.count(Activity.id)).where(Activity.source_event_id == event.id)
    ).scalar_one()
    assert count == 0


@pytest.mark.parametrize("project_creation_first", [True, False])
def test_first_share_of_private_heart_moment_creates_one_partner_activity(
    client, session: Session, couple, project_creation_first: bool
) -> None:  # type: ignore[no-untyped-def]
    space_id = couple["space"].id
    base_path = f"/api/v1/spaces/{space_id}/heart-moments"
    created = client.post(
        base_path,
        headers=auth(couple["anna_token"]),
        json={
            "text": "Private until I decide to share",
            "emotion": "LOVED",
            "visibility": "PRIVATE",
            "happenedOn": NOW.date().isoformat(),
        },
    )
    assert created.status_code == 201
    heart_id = UUID(created.json()["id"])
    creation_event = session.execute(
        select(OutboxEvent).where(
            OutboxEvent.subject_id == heart_id,
            OutboxEvent.event_type == EventType.HEART_MOMENT_CREATED.value,
        )
    ).scalar_one()

    if project_creation_first:
        service.project_event(session, creation_event)
        assert (
            session.execute(
                select(func.count(Activity.id)).where(Activity.target_id == heart_id)
            ).scalar_one()
            == 0
        )

    shared = client.patch(
        f"{base_path}/{heart_id}/visibility",
        headers={**auth(couple["anna_token"]), "If-Match": '"1"'},
        json={"visibility": "SHARED"},
    )
    assert shared.status_code == 200
    share_event = session.execute(
        select(OutboxEvent).where(
            OutboxEvent.subject_id == heart_id,
            OutboxEvent.event_type == EventType.HEART_MOMENT_VISIBILITY_CHANGED.value,
            OutboxEvent.resource_version == 2,
        )
    ).scalar_one()

    service.project_event(session, share_event)
    service.project_event(session, creation_event)
    service.project_event(session, share_event)
    session.flush()

    activities = list(
        session.execute(select(Activity).where(Activity.target_id == heart_id)).scalars()
    )
    assert len(activities) == 1
    assert activities[0].kind == ActivityKind.HEART_MOMENT_CREATED.value
    assert activities[0].source_event_id == share_event.id
    assert (
        session.execute(
            select(func.count(Notification.id)).where(Notification.target_id == heart_id)
        ).scalar_one()
        == 0
    )

    partner_activity = client.get(
        f"/api/v1/spaces/{space_id}/activity", headers=auth(couple["ben_token"])
    )
    assert partner_activity.status_code == 200
    assert [item["targetId"] for item in partner_activity.json()["items"]] == [str(heart_id)]

    hidden = client.patch(
        f"{base_path}/{heart_id}/visibility",
        headers={**auth(couple["anna_token"]), "If-Match": '"2"'},
        json={"visibility": "PRIVATE"},
    )
    assert hidden.status_code == 200
    assert (
        client.get(f"/api/v1/spaces/{space_id}/activity", headers=auth(couple["ben_token"])).json()[
            "items"
        ]
        == []
    )

    reshared = client.patch(
        f"{base_path}/{heart_id}/visibility",
        headers={**auth(couple["anna_token"]), "If-Match": '"3"'},
        json={"visibility": "SHARED"},
    )
    assert reshared.status_code == 200
    reshare_event = session.execute(
        select(OutboxEvent).where(
            OutboxEvent.subject_id == heart_id,
            OutboxEvent.event_type == EventType.HEART_MOMENT_VISIBILITY_CHANGED.value,
            OutboxEvent.resource_version == 4,
        )
    ).scalar_one()
    service.project_event(session, reshare_event)
    session.flush()
    assert (
        session.execute(
            select(func.count(Activity.id)).where(Activity.target_id == heart_id)
        ).scalar_one()
        == 1
    )


def test_share_event_does_not_publish_activity_after_privacy_is_revoked(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    heart_moment = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.OWNER_ONLY.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="Still private", emotion=HeartEmotion.SEEN),
    )
    session.add(heart_moment)
    session.flush()
    share_event = _event(
        session,
        couple,
        EventType.HEART_MOMENT_VISIBILITY_CHANGED,
        heart_moment,
        payload=PublicEventPayload(visibility=ContentVisibility.SHARED),
    )

    service.project_event(session, share_event)
    assert (
        session.execute(
            select(func.count(Activity.id)).where(Activity.source_event_id == share_event.id)
        ).scalar_one()
        == 0
    )
    partner_activity = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert partner_activity.status_code == 200
    assert partner_activity.json()["items"] == []


def test_comment_notifies_only_other_authorized_partner_and_replay_is_idempotent(
    session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple, owner=couple["anna"])
    ben_context = AuthorizationContext(
        account_id=couple["ben"].id,
        space_id=couple["space"].id,
    )
    comment = comment_service.create_comment(
        session,
        ben_context,
        target_type=CommentTarget.MEMORY,
        target_id=memory.id,
        body="Private relationship prose must stay out of the projection.",
    )
    event = session.execute(
        select(OutboxEvent).where(
            OutboxEvent.event_type == EventType.COMMENT_CREATED.value,
            OutboxEvent.subject_id == comment.id,
        )
    ).scalar_one()

    service.project_event(session, event)
    service.project_event(session, event)
    session.flush()

    notifications = (
        session.execute(select(Notification).where(Notification.source_event_id == event.id))
        .scalars()
        .all()
    )
    assert len(notifications) == 1
    notification = notifications[0]
    assert notification.recipient_account_id == couple["anna"].id
    assert notification.recipient_account_id != couple["ben"].id
    assert notification.kind == NotificationKind.COMMENT_CREATED.value
    assert notification.target_id == memory.id
    assert not hasattr(notification, "payload")
    assert not hasattr(notification, "body")


def test_later_privacy_transition_suppresses_stale_activity_immediately(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    heart_moment = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="Shared first", emotion=HeartEmotion.SEEN),
    )
    session.add(heart_moment)
    session.flush()
    event = _event(
        session,
        couple,
        EventType.HEART_MOMENT_CREATED,
        heart_moment,
        payload=PublicEventPayload(visibility=ContentVisibility.SHARED),
    )
    service.project_event(session, event)
    session.flush()

    before = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert before.status_code == 200
    assert str(heart_moment.id) in {item["targetId"] for item in before.json()["items"]}

    heart_moment.privacy_class = PrivacyClass.OWNER_ONLY.value
    session.flush()

    after = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert after.status_code == 200
    assert str(heart_moment.id) not in {item["targetId"] for item in after.json()["items"]}


def test_activity_cursor_is_bound_to_account_and_space(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple)
    for offset in range(3):
        session.add(
            Activity(
                space_id=couple["space"].id,
                source_event_id=uuid4(),
                kind=ActivityKind.MEMORY_CREATED.value,
                actor_id=couple["anna"].id,
                target_type="MEMORY",
                target_id=memory.id,
                occurred_at=NOW - timedelta(minutes=offset),
            )
        )
    session.flush()

    first = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity?limit=1",
        headers=auth(couple["anna_token"]),
    )
    assert first.status_code == 200
    body = first.json()
    assert body["hasMore"] is True
    assert body["nextCursor"] is not None

    partner_reuse = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        params={"cursor": body["nextCursor"]},
        headers=auth(couple["ben_token"]),
    )
    assert partner_reuse.status_code == 400
    assert partner_reuse.json()["code"] == "INVALID_CURSOR"

    foreign_reuse = client.get(
        f"/api/v1/spaces/{couple['foreign_space'].id}/activity",
        params={"cursor": body["nextCursor"]},
        headers=auth(couple["outsider_token"]),
    )
    assert foreign_reuse.status_code == 400
    assert foreign_reuse.json()["code"] == "INVALID_CURSOR"


def test_notification_read_is_idempotent_and_foreign_account_gets_404(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple)
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["anna"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["ben"].id,
        target_type="MEMORY",
        target_id=memory.id,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()
    read_at = NOW + timedelta(minutes=1)
    monkeypatch.setattr(service.clock, "now", lambda: read_at)

    path = f"/api/v1/spaces/{couple['space'].id}/notifications/{notification.id}/read"
    first = client.post(path, headers=auth(couple["anna_token"]))
    second = client.post(path, headers=auth(couple["anna_token"]))
    assert first.status_code == second.status_code == 200
    assert first.json()["readAt"] == second.json()["readAt"]

    foreign = client.post(path, headers=auth(couple["ben_token"]))
    assert foreign.status_code == 404
    assert foreign.json()["code"] == "NOTIFICATION_NOT_FOUND"


def test_mark_all_uses_cutoff_and_unread_count_ignores_later_rows(
    client, session: Session, couple, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple)
    old = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["anna"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["ben"].id,
        target_type="MEMORY",
        target_id=memory.id,
        created_at=NOW - timedelta(minutes=1),
    )
    session.add(old)
    session.flush()
    monkeypatch.setattr(service.clock, "now", lambda: NOW)

    response = client.post(
        f"/api/v1/spaces/{couple['space'].id}/notifications/read-all",
        headers=auth(couple["anna_token"]),
    )
    assert response.status_code == 200
    assert response.json()["updated"] == 1

    later = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["anna"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["ben"].id,
        target_type="MEMORY",
        target_id=memory.id,
        created_at=NOW + timedelta(seconds=1),
    )
    session.add(later)
    session.flush()

    count = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications/unread-count",
        headers=auth(couple["anna_token"]),
    )
    assert count.status_code == 200
    assert count.json()["unreadCount"] == 1


def test_deleted_target_disappears_from_notification_list_and_count(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple)
    notification = Notification(
        space_id=couple["space"].id,
        recipient_account_id=couple["anna"].id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=couple["ben"].id,
        target_type="MEMORY",
        target_id=memory.id,
        created_at=NOW,
    )
    session.add(notification)
    session.flush()

    before = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications/unread-count",
        headers=auth(couple["anna_token"]),
    )
    assert before.status_code == 200
    assert before.json()["unreadCount"] == 1

    session.delete(memory)
    session.flush()

    after = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications",
        headers=auth(couple["anna_token"]),
    )
    assert after.status_code == 200
    assert after.json()["items"] == []

    count = client.get(
        f"/api/v1/spaces/{couple['space'].id}/notifications/unread-count",
        headers=auth(couple["anna_token"]),
    )
    assert count.status_code == 200
    assert count.json()["unreadCount"] == 0


def test_activity_actor_and_target_presentation(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    memory = _shared_memory(session, couple, title="First shared memory")
    activity = Activity(
        space_id=couple["space"].id,
        source_event_id=uuid4(),
        kind=ActivityKind.MEMORY_CREATED.value,
        actor_id=couple["anna"].id,
        target_type="MEMORY",
        target_id=memory.id,
        occurred_at=NOW,
    )
    session.add(activity)
    session.flush()

    res = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    item = items[0]

    # AuthorSummary contract
    assert item["actor"] is not None
    assert item["actor"]["id"] == str(couple["anna"].id)
    assert item["actor"]["displayName"] == couple["anna"].display_name

    # ActivityTargetPresentation contract
    assert item["target"] is not None
    assert item["target"]["targetType"] == "MEMORY"
    assert item["target"]["targetId"] == str(memory.id)
    assert item["target"]["title"] == "First shared memory"


def test_activity_heart_moment_target_presentation(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    heart = HeartMoment(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        happened_on=NOW.date(),
        payload=HeartMomentPayload(text="You made me smile today", emotion=HeartEmotion.HAPPY),
    )
    session.add(heart)
    session.flush()
    activity = Activity(
        space_id=couple["space"].id,
        source_event_id=uuid4(),
        kind=ActivityKind.HEART_MOMENT_CREATED.value,
        actor_id=couple["anna"].id,
        target_type="HEART_MOMENT",
        target_id=heart.id,
        occurred_at=NOW,
    )
    session.add(activity)
    session.flush()

    res = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert res.status_code == 200
    items = res.json()["items"]
    assert len(items) == 1
    assert items[0]["target"]["title"] == "You made me smile today"


def test_activity_noise_reduction_and_relationship_curation(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    # 1. Anna creates repetitive utility resources
    plan_anna = Plan(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=PlanStatus.PLANNED.value,
        planned_start=NOW,
        payload=PlanPayload(title="Anna's Plan"),
    )
    place_anna = Place(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=PlacePayload(name="Anna's Place"),
    )
    col_anna = Collection(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=CollectionPayload(title="Anna's Collection"),
    )
    wish_anna = Wish(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=WishPayload(title="Anna's Wish"),
    )
    # 2. Emotional, completion, and reaction resources
    memory_anna = Memory(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        payload=MemoryPayload(title="Anna's Memory", body="Sunset"),
    )
    completed_plan_anna = Plan(
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=PlanStatus.COMPLETED.value,
        planned_start=NOW,
        experienced_on=NOW.date(),
        payload=PlanPayload(title="Anna's Completed Plan"),
    )
    # 3. Ben's plan (partner action from Anna's perspective)
    plan_ben = Plan(
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=PlanStatus.PLANNED.value,
        planned_start=NOW,
        payload=PlanPayload(title="Ben's Plan"),
    )
    session.add_all(
        [
            plan_anna,
            place_anna,
            col_anna,
            wish_anna,
            memory_anna,
            completed_plan_anna,
            plan_ben,
        ]
    )
    session.flush()

    activities = [
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.PLAN_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="PLAN",
            target_id=plan_anna.id,
            occurred_at=NOW - timedelta(minutes=10),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.PLACE_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="PLACE",
            target_id=place_anna.id,
            occurred_at=NOW - timedelta(minutes=9),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.COLLECTION_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="COLLECTION",
            target_id=col_anna.id,
            occurred_at=NOW - timedelta(minutes=8),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.WISH_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="WISH",
            target_id=wish_anna.id,
            occurred_at=NOW - timedelta(minutes=7),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.MEMORY_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="MEMORY",
            target_id=memory_anna.id,
            occurred_at=NOW - timedelta(minutes=6),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.PLAN_COMPLETED.value,
            actor_id=couple["anna"].id,
            target_type="PLAN",
            target_id=completed_plan_anna.id,
            occurred_at=NOW - timedelta(minutes=5),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.COMMENT_CREATED.value,
            actor_id=couple["anna"].id,
            target_type="MEMORY",
            target_id=memory_anna.id,
            occurred_at=NOW - timedelta(minutes=4),
        ),
        Activity(
            space_id=couple["space"].id,
            source_event_id=uuid4(),
            kind=ActivityKind.PLAN_CREATED.value,
            actor_id=couple["ben"].id,
            target_type="PLAN",
            target_id=plan_ben.id,
            occurred_at=NOW - timedelta(minutes=3),
        ),
    ]
    session.add_all(activities)
    session.flush()

    # Anna views the feed:
    # Own low-value CRUD noise (PLAN, PLACE, COLLECTION, WISH) must be suppressed.
    # Partner's PLAN_CREATED must remain visible.
    # Own MEMORY_CREATED, PLAN_COMPLETED, COMMENT_CREATED must remain visible.
    res_anna = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["anna_token"]),
    )
    assert res_anna.status_code == 200
    anna_items = res_anna.json()["items"]
    anna_kinds = [item["kind"] for item in anna_items]

    assert ActivityKind.PLAN_CREATED.value in anna_kinds
    assert ActivityKind.MEMORY_CREATED.value in anna_kinds
    assert ActivityKind.PLAN_COMPLETED.value in anna_kinds
    assert ActivityKind.COMMENT_CREATED.value in anna_kinds
    assert ActivityKind.PLACE_CREATED.value not in anna_kinds
    assert ActivityKind.COLLECTION_CREATED.value not in anna_kinds
    assert ActivityKind.WISH_CREATED.value not in anna_kinds
    assert len(anna_items) == 4

    # Verify that the single PLAN_CREATED visible to Anna belongs to Ben
    plan_item_for_anna = next(
        item for item in anna_items if item["kind"] == ActivityKind.PLAN_CREATED.value
    )
    assert plan_item_for_anna["actor"]["id"] == str(couple["ben"].id)

    # Ben views the feed:
    # Anna's utility creations ARE visible to Ben.
    # Ben's own PLAN_CREATED is suppressed for Ben.
    res_ben = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["ben_token"]),
    )
    assert res_ben.status_code == 200
    ben_items = res_ben.json()["items"]
    ben_kinds = [item["kind"] for item in ben_items]

    assert ActivityKind.PLACE_CREATED.value in ben_kinds
    assert ActivityKind.COLLECTION_CREATED.value in ben_kinds
    assert ActivityKind.WISH_CREATED.value in ben_kinds
    plan_items_for_ben = [
        item for item in ben_items if item["kind"] == ActivityKind.PLAN_CREATED.value
    ]
    assert len(plan_items_for_ben) == 1
    assert plan_items_for_ben[0]["actor"]["id"] == str(couple["anna"].id)

    # Tenant isolation: outsider gets 403
    res_outsider = client.get(
        f"/api/v1/spaces/{couple['space'].id}/activity",
        headers=auth(couple["outsider_token"]),
    )
    assert res_outsider.status_code in (403, 404)
