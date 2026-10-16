"""Intentional Story-view aggregate privacy, lifecycle, and concurrency tests."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Barrier

import pytest
from sqlalchemy import Engine, delete, select
from sqlalchemy.orm import Session, sessionmaker

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.core.errors import NotFoundError
from eimir.heart_moments import service as heart_service
from eimir.heart_moments.models import HeartEmotion
from eimir.identity.deletion import apply_accepted_tombstone
from eimir.identity.models import Account
from eimir.memories import service as memory_service
from eimir.milestones import service as milestone_service
from eimir.relationship import offboarding
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Space
from eimir.story import view_service
from eimir.story.service import StoryKind
from eimir.story.view_models import StoryItemViewAggregate
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


class _RecordHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture
def story_setup(session: Session) -> dict[str, object]:
    viewer = make_account(session, "Viewer")
    partner = make_account(session, "Partner")
    outsider = make_account(session, "Outsider")
    space = make_space(session, viewer)
    relationship_service.add_member(session, space.id, partner)
    foreign_space = make_space(session, outsider)
    context = AuthorizationContext(account_id=viewer.id, space_id=space.id)
    foreign_context = AuthorizationContext(account_id=outsider.id, space_id=foreign_space.id)

    memory = memory_service.create_memory(
        session,
        context,
        title="Shared memory",
        body="Body",
        happened_on=date(2025, 6, 13),
    )
    shared_heart = heart_service.create_heart_moment(
        session,
        context,
        text="Shared heart",
        emotion=HeartEmotion.LOVED,
        visibility=ContentVisibility.SHARED,
        happened_on=date(2025, 6, 13),
    )
    private_heart = heart_service.create_heart_moment(
        session,
        context,
        text="Private heart",
        emotion=HeartEmotion.SEEN,
        visibility=ContentVisibility.PRIVATE,
        happened_on=date(2025, 6, 14),
    )
    milestone = milestone_service.create_milestone(
        session,
        context,
        title="Milestone",
        body=None,
        happened_on=date(2025, 6, 15),
    )
    foreign_memory = memory_service.create_memory(
        session,
        foreign_context,
        title="Foreign memory",
        body="Body",
        happened_on=date(2025, 6, 13),
    )
    session.flush()
    return {
        "viewer": viewer,
        "partner": partner,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "context": context,
        "memory": memory,
        "shared_heart": shared_heart,
        "private_heart": private_heart,
        "milestone": milestone,
        "foreign_memory": foreign_memory,
    }


def _rows(session: Session) -> list[StoryItemViewAggregate]:
    return list(session.execute(select(StoryItemViewAggregate)).scalars().all())


def _record(
    session: Session,
    setup: dict[str, object],
    *,
    kind: StoryKind = StoryKind.MEMORY,
    item_key: str = "memory",
    at: datetime = datetime(2026, 1, 1, 12, tzinfo=UTC),
    timezone: str = "Europe/Berlin",
) -> StoryItemViewAggregate:
    item = setup[item_key]
    view_service.record_intentional_view(
        session,
        setup["context"],  # type: ignore[arg-type]
        account_timezone=timezone,
        kind=kind,
        item_id=item.id,  # type: ignore[union-attr]
        viewed_at=at,
    )
    session.flush()
    session.expire_all()
    return _rows(session)[0]


def test_first_eligible_view_creates_score_one(session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    aggregate = _record(session, story_setup)

    assert aggregate.distinct_view_days_capped == 1
    assert aggregate.last_counted_local_date == date(2026, 1, 1)


def test_repeated_same_day_opens_do_not_increment(session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    first = datetime(2026, 1, 1, 9, tzinfo=UTC)
    later = datetime(2026, 1, 1, 20, tzinfo=UTC)
    _record(session, story_setup, at=first)
    aggregate = _record(session, story_setup, at=later)

    assert aggregate.distinct_view_days_capped == 1
    assert aggregate.last_viewed_at == later


def test_later_local_day_increments_and_score_caps_at_five(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    start = datetime(2026, 1, 1, 12, tzinfo=UTC)
    for offset in range(8):
        aggregate = _record(session, story_setup, at=start + timedelta(days=offset))

    assert aggregate.distinct_view_days_capped == 5
    assert aggregate.last_counted_local_date == date(2026, 1, 8)


def test_account_timezone_controls_counted_day(session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    instant = datetime(2026, 1, 1, 0, 30, tzinfo=UTC)
    aggregate = _record(
        session,
        story_setup,
        at=instant,
        timezone="America/Los_Angeles",
    )

    assert aggregate.last_counted_local_date == date(2025, 12, 31)


def test_dst_transition_does_not_create_a_second_local_day(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    _record(
        session,
        story_setup,
        at=datetime(2026, 3, 29, 0, 30, tzinfo=UTC),
        timezone="Europe/Berlin",
    )
    aggregate = _record(
        session,
        story_setup,
        at=datetime(2026, 3, 29, 1, 30, tzinfo=UTC),
        timezone="Europe/Berlin",
    )

    assert aggregate.distinct_view_days_capped == 1
    assert aggregate.last_counted_local_date == date(2026, 3, 29)


@pytest.mark.parametrize(
    ("kind", "item_key"),
    [
        (StoryKind.MEMORY, "memory"),
        (StoryKind.HEART_MOMENT, "shared_heart"),
        (StoryKind.MILESTONE, "milestone"),
    ],
)
def test_all_shared_story_kinds_are_eligible(
    session: Session,
    story_setup,
    kind: StoryKind,
    item_key: str,
) -> None:  # type: ignore[no-untyped-def]
    aggregate = _record(session, story_setup, kind=kind, item_key=item_key)

    assert aggregate.item_kind == kind.value


def test_owner_viewing_own_private_heart_moment_creates_an_aggregate(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    """#1021 (superseding M2-D22): the owner's own OWNER_ONLY HeartMoment is
    now part of their own Story, so opening it from their own Timeline is as
    intentional a view as any shared one and must be recordable.
    """
    private_heart = story_setup["private_heart"]

    aggregate = _record(session, story_setup, kind=StoryKind.HEART_MOMENT, item_key="private_heart")

    assert aggregate.item_id == private_heart.id  # type: ignore[union-attr]
    assert aggregate.viewer_account_id == story_setup["viewer"].id  # type: ignore[union-attr]


def test_partner_cannot_record_a_view_for_the_owners_private_heart_moment(
    client,
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    """The owner-inclusion above must not weaken the partner's absence: the
    partner gets the same non-enumerating 404 as any other unauthorized
    target, and creates no aggregate.
    """
    partner = story_setup["partner"]
    space = story_setup["space"]
    private_heart = story_setup["private_heart"]
    partner_token = sign_in(session, partner)

    response = client.post(
        f"/api/v1/spaces/{space.id}/story-views",  # type: ignore[union-attr]
        json={"kind": "HEART_MOMENT", "itemId": str(private_heart.id)},  # type: ignore[union-attr]
        headers=auth(partner_token),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "RESOURCE_NOT_FOUND"
    assert _rows(session) == []


def test_foreign_space_target_creates_no_aggregate(session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    foreign_memory = story_setup["foreign_memory"]

    with pytest.raises(NotFoundError):
        view_service.record_intentional_view(
            session,
            story_setup["context"],  # type: ignore[arg-type]
            account_timezone="Europe/Berlin",
            kind=StoryKind.MEMORY,
            item_id=foreign_memory.id,  # type: ignore[union-attr]
        )

    assert _rows(session) == []


def test_missing_and_malformed_targets_are_equally_absent(
    client,
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    viewer = story_setup["viewer"]
    space = story_setup["space"]
    token = sign_in(session, viewer)
    headers = auth(token)
    path = f"/api/v1/spaces/{space.id}/story-views"  # type: ignore[union-attr]

    malformed = client.post(
        path,
        json={"kind": "MEMORY", "itemId": "not-a-uuid"},
        headers=headers,
    )
    missing = client.post(
        path,
        json={"kind": "MEMORY", "itemId": "00000000-0000-0000-0000-000000000001"},
        headers=headers,
    )

    assert (
        (malformed.status_code, malformed.json()["code"])
        == (
            missing.status_code,
            missing.json()["code"],
        )
        == (404, "RESOURCE_NOT_FOUND")
    )
    assert _rows(session) == []


def test_unauthorized_space_target_is_non_enumerating(
    client,
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    outsider = story_setup["outsider"]
    space = story_setup["space"]
    outsider_token = sign_in(session, outsider)
    path = f"/api/v1/spaces/{space.id}/story-views"  # type: ignore[union-attr]

    unauthorized = client.post(
        path,
        json={"kind": "MEMORY", "itemId": str(story_setup["memory"].id)},  # type: ignore[union-attr]
        headers=auth(outsider_token),
    )

    assert unauthorized.status_code == 404
    assert _rows(session) == []


def test_visibility_transitions_purge_view_aggregates_in_both_directions(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    heart = story_setup["shared_heart"]
    _record(
        session,
        story_setup,
        kind=StoryKind.HEART_MOMENT,
        item_key="shared_heart",
    )

    heart = heart_service.change_visibility(
        session,
        story_setup["context"],  # type: ignore[arg-type]
        heart.id,  # type: ignore[union-attr]
        expected_version=heart.version,  # type: ignore[union-attr]
        visibility=ContentVisibility.PRIVATE,
    )
    assert _rows(session) == []

    # #1021 allows the owner to record intentional views while the HeartMoment
    # is private. Those aggregates must not survive a later PRIVATE -> SHARED
    # transition or they could immediately become #971 partner-affinity input.
    for offset in range(3):
        aggregate = _record(
            session,
            story_setup,
            kind=StoryKind.HEART_MOMENT,
            item_key="shared_heart",
            at=datetime(2026, 1, 2 + offset, 12, tzinfo=UTC),
        )
    assert aggregate.distinct_view_days_capped == 3

    heart_service.change_visibility(
        session,
        story_setup["context"],  # type: ignore[arg-type]
        heart.id,
        expected_version=heart.version,
        visibility=ContentVisibility.SHARED,
    )
    assert _rows(session) == []


@pytest.mark.parametrize("kind", list(StoryKind))
def test_target_deletion_purges_aggregate(
    session: Session,
    story_setup,
    kind: StoryKind,
) -> None:  # type: ignore[no-untyped-def]
    item_key = {
        StoryKind.MEMORY: "memory",
        StoryKind.HEART_MOMENT: "shared_heart",
        StoryKind.MILESTONE: "milestone",
    }[kind]
    item = story_setup[item_key]
    _record(session, story_setup, kind=kind, item_key=item_key)

    if kind is StoryKind.MEMORY:
        memory_service.delete_memory(
            session,
            story_setup["context"],  # type: ignore[arg-type]
            item.id,  # type: ignore[union-attr]
            expected_version=item.version,  # type: ignore[union-attr]
        )
    elif kind is StoryKind.HEART_MOMENT:
        heart_service.delete_heart_moment(
            session,
            story_setup["context"],  # type: ignore[arg-type]
            item.id,  # type: ignore[union-attr]
            expected_version=item.version,  # type: ignore[union-attr]
        )
    else:
        milestone_service.delete_milestone(
            session,
            story_setup["context"],  # type: ignore[arg-type]
            item.id,  # type: ignore[union-attr]
            expected_version=item.version,  # type: ignore[union-attr]
        )

    assert _rows(session) == []


def test_membership_offboarding_purges_viewer_state(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    _record(session, story_setup)

    offboarding.leave_space(
        session,
        story_setup["viewer"],  # type: ignore[arg-type]
        story_setup["space"].id,  # type: ignore[union-attr]
    )

    assert _rows(session) == []


def test_account_deletion_and_space_deletion_cleanup(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    _record(session, story_setup)
    apply_accepted_tombstone(
        session,
        story_setup["viewer"].id,  # type: ignore[union-attr]
        accepted_at=datetime(2026, 1, 2, tzinfo=UTC),
    )
    assert _rows(session) == []

    outsider_context = AuthorizationContext(
        account_id=story_setup["outsider"].id,  # type: ignore[union-attr]
        space_id=story_setup["foreign_space"].id,  # type: ignore[union-attr]
    )
    view_service.record_intentional_view(
        session,
        outsider_context,
        account_timezone="Europe/Berlin",
        kind=StoryKind.MEMORY,
        item_id=story_setup["foreign_memory"].id,  # type: ignore[union-attr]
    )
    session.execute(
        delete(Space).where(Space.id == story_setup["foreign_space"].id)  # type: ignore[union-attr]
    )
    session.flush()
    assert _rows(session) == []


def test_twelve_month_retention_removes_only_expired_rows(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    now = datetime(2026, 9, 17, 12, tzinfo=UTC)
    aggregate = _record(session, story_setup, at=now - timedelta(days=366))
    assert aggregate.last_viewed_at < view_service.retention_cutoff(now)
    _record(
        session,
        story_setup,
        kind=StoryKind.MILESTONE,
        item_key="milestone",
        at=now - timedelta(days=364),
    )

    assert view_service.prune_expired(session, at=now) == 1
    remaining = _rows(session)
    assert len(remaining) == 1
    assert remaining[0].item_kind == StoryKind.MILESTONE.value


def test_story_gets_remain_side_effect_free(client, session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    token = sign_in(session, story_setup["viewer"])
    space = story_setup["space"]
    memory = story_setup["memory"]

    detail = client.get(
        f"/api/v1/spaces/{space.id}/memories/{memory.id}",  # type: ignore[union-attr]
        headers=auth(token),
    )
    timeline = client.get(
        f"/api/v1/spaces/{space.id}/timeline",  # type: ignore[union-attr]
        headers=auth(token),
    )

    assert detail.status_code == timeline.status_code == 200
    assert _rows(session) == []


def test_write_endpoint_logs_route_but_not_request_item_id(
    client,
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    viewer = story_setup["viewer"]
    space = story_setup["space"]
    item_id = str(story_setup["memory"].id)  # type: ignore[union-attr]
    token = sign_in(session, viewer)
    path = f"/api/v1/spaces/{space.id}/story-views"  # type: ignore[union-attr]
    access_logger = logging.getLogger("eimir.access")
    handler = _RecordHandler()
    previous_level = access_logger.level
    previous_disabled = access_logger.disabled

    access_logger.addHandler(handler)
    access_logger.setLevel(logging.INFO)
    access_logger.disabled = False
    try:
        response = client.post(
            path,
            json={"kind": "MEMORY", "itemId": item_id},
            headers=auth(token),
        )
    finally:
        access_logger.removeHandler(handler)
        access_logger.setLevel(previous_level)
        access_logger.disabled = previous_disabled

    assert response.status_code == 204
    relevant_records = [
        record for record in handler.records if getattr(record, "http_path", "") == path
    ]
    assert relevant_records, "expected eimir.access to record the Story-view request"
    assert all("/story-views" in record.getMessage() for record in relevant_records)
    assert all(item_id not in record.getMessage() for record in relevant_records)


def test_story_views_has_no_read_api(client, session: Session, story_setup) -> None:  # type: ignore[no-untyped-def]
    token = sign_in(session, story_setup["viewer"])
    space = story_setup["space"]

    response = client.get(
        f"/api/v1/spaces/{space.id}/story-views",  # type: ignore[union-attr]
        headers=auth(token),
    )

    assert response.status_code == 405


def test_concurrent_same_day_writes_increment_once(engine: Engine) -> None:
    maker = sessionmaker(bind=engine, expire_on_commit=False)
    with maker() as session:
        viewer = make_account(session, "Concurrent viewer")
        space = make_space(session, viewer)
        context = AuthorizationContext(account_id=viewer.id, space_id=space.id)
        memory = memory_service.create_memory(
            session,
            context,
            title="Concurrent memory",
            body="Body",
            happened_on=date(2025, 1, 1),
        )
        viewer_id = viewer.id
        space_id = space.id
        memory_id = memory.id
        session.commit()

    barrier = Barrier(2)
    instant = datetime(2026, 1, 1, 12, tzinfo=UTC)

    def record() -> None:
        with maker() as session:
            barrier.wait(timeout=5)
            view_service.record_intentional_view(
                session,
                AuthorizationContext(account_id=viewer_id, space_id=space_id),
                account_timezone="Europe/Berlin",
                kind=StoryKind.MEMORY,
                item_id=memory_id,
                viewed_at=instant,
            )
            session.commit()

    with ThreadPoolExecutor(max_workers=2) as pool:
        for future in [pool.submit(record), pool.submit(record)]:
            future.result(timeout=10)

    with maker() as session:
        aggregate = session.execute(select(StoryItemViewAggregate)).scalar_one()
        assert aggregate.distinct_view_days_capped == 1
        session.execute(delete(Space).where(Space.id == space_id))
        session.execute(delete(Account).where(Account.id == viewer_id))
        session.commit()


def test_account_foreign_key_cascade_removes_aggregate(
    session: Session,
    story_setup,
) -> None:  # type: ignore[no-untyped-def]
    _record(session, story_setup)

    session.execute(
        delete(Account).where(Account.id == story_setup["viewer"].id)  # type: ignore[union-attr]
    )
    session.flush()

    assert _rows(session) == []
