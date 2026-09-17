"""PostgreSQL/HTTP acceptance for the canonical Discover read model."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.core import clock
from eimir.db import session as db_session
from eimir.heart_moments import service as heart_service
from eimir.heart_moments.models import HeartEmotion
from eimir.main import create_app
from eimir.memories import service as memory_service
from eimir.relationship import service as relationship_service
from eimir.relationship.models import Membership, MembershipStatus
from eimir.story import discover_service
from eimir.story.service import StoryKind
from eimir.story.view_models import DiscoverSelectionSnapshot, StoryItemViewAggregate
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

FIXED_NOW = datetime(2026, 9, 17, 10, tzinfo=UTC)


@pytest.fixture
def discover_setup(session: Session, monkeypatch) -> dict[str, object]:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: FIXED_NOW)
    viewer = make_account(session, "Viewer")
    partner = make_account(session, "Partner")
    outsider = make_account(session, "Outsider")
    space = make_space(session, viewer)
    relationship_service.add_member(session, space.id, partner)
    foreign_space = make_space(session, outsider)
    session.flush()
    return {
        "viewer": viewer,
        "partner": partner,
        "outsider": outsider,
        "space": space,
        "foreign_space": foreign_space,
        "context": AuthorizationContext(account_id=viewer.id, space_id=space.id),
        "partner_context": AuthorizationContext(account_id=partner.id, space_id=space.id),
        "token": sign_in(session, viewer),
        "partner_token": sign_in(session, partner),
        "outsider_token": sign_in(session, outsider),
    }


def _memory(
    session: Session,
    setup: dict[str, object],
    number: int,
    happened_on: date,
    *,
    context_key: str = "context",
):  # type: ignore[no-untyped-def]
    return memory_service.create_memory(
        session,
        setup[context_key],  # type: ignore[arg-type]
        title=f"Memory {number}",
        body="Body",
        happened_on=happened_on,
    )


def _heart(
    session: Session,
    setup: dict[str, object],
    happened_on: date,
    *,
    visibility: ContentVisibility,
):  # type: ignore[no-untyped-def]
    return heart_service.create_heart_moment(
        session,
        setup["context"],  # type: ignore[arg-type]
        text="Heart",
        emotion=HeartEmotion.LOVED,
        visibility=visibility,
        happened_on=happened_on,
    )


def _get(client, setup: dict[str, object], *, token_key: str = "token"):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{setup['space'].id}/discover",  # type: ignore[union-attr]
        headers=auth(setup[token_key]),  # type: ignore[arg-type]
    )


def _identity(item: dict[str, object]) -> str:
    key = {
        "MEMORY": "memory",
        "HEART_MOMENT": "heartMoment",
        "MILESTONE": "milestone",
    }[str(item["kind"])]
    return str(item[key]["id"])  # type: ignore[index]


def _ordered_ids(body: dict[str, object]) -> list[str]:
    lead = body["lead"]
    items = body["items"]
    values = ([] if lead is None else [lead]) + list(items)  # type: ignore[arg-type]
    return [_identity(item) for item in values]


def test_endpoint_is_finite_minimal_and_returns_eight_unique_items(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    for index in range(12):
        _memory(
            session,
            discover_setup,
            index,
            date(2010 + index, (index % 12) + 1, (index % 20) + 1),
        )
    session.flush()

    response = _get(client, discover_setup)

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"selectionDate", "lead", "items", "leadContext"}
    ids = _ordered_ids(body)
    assert len(ids) == 8
    assert len(set(ids)) == 8
    assert body["lead"] not in body["items"]
    serialized = response.text.lower()
    assert "affinity" not in serialized
    assert "algorithm" not in serialized
    assert "score" not in serialized
    assert "ranking" not in serialized
    assert "cursor" not in serialized
    assert "hasmore" not in serialized
    assert "availableyears" not in serialized


def test_sparse_history_returns_fewer_than_eight_without_duplicates(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    first = _memory(session, discover_setup, 1, date(2020, 1, 1))
    second = _memory(session, discover_setup, 2, date(2021, 2, 2))
    session.flush()

    body = _get(client, discover_setup).json()

    assert set(_ordered_ids(body)) == {str(first.id), str(second.id)}
    assert len(_ordered_ids(body)) == 2


def test_exact_date_lead_has_context_and_near_only_lead_does_not(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    exact = _memory(session, discover_setup, 1, date(2023, 9, 17))
    _memory(session, discover_setup, 2, date(2025, 9, 16))
    session.flush()

    exact_response = _get(client, discover_setup)
    assert _identity(exact_response.json()["lead"]) == str(exact.id)
    assert exact_response.json()["leadContext"] == {"type": "ON_THIS_DAY", "yearsAgo": 3}

    second_space = make_space(session, discover_setup["viewer"])
    relationship_service.add_member(session, second_space.id, discover_setup["partner"])
    second_context = AuthorizationContext(
        account_id=discover_setup["viewer"].id,
        space_id=second_space.id,
    )
    near = memory_service.create_memory(
        session,
        second_context,
        title="Near",
        body="Body",
        happened_on=date(2025, 9, 16),
    )
    session.flush()
    response = client.get(
        f"/api/v1/spaces/{second_space.id}/discover",
        headers=auth(discover_setup["token"]),
    )
    assert _identity(response.json()["lead"]) == str(near.id)
    assert response.json()["leadContext"] is None


def test_leap_day_uses_canonical_annual_occurrence(
    client, session: Session, discover_setup, monkeypatch
) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: datetime(2025, 2, 28, 10, tzinfo=UTC))
    leap = _memory(session, discover_setup, 1, date(2024, 2, 29))
    session.flush()

    body = _get(client, discover_setup).json()

    assert _identity(body["lead"]) == str(leap.id)
    assert body["leadContext"] == {"type": "ON_THIS_DAY", "yearsAgo": 1}


def test_same_day_snapshot_is_stable_and_algorithm_change_cannot_replace_it(
    session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    for index in range(10):
        _memory(session, discover_setup, index, date(2010 + index, 3, 2))
    session.flush()
    context = discover_setup["context"]

    first = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Europe/Berlin",
        at=FIXED_NOW,
        algorithm_version="version-a",
    )
    second = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Europe/Berlin",
        at=FIXED_NOW,
        algorithm_version="version-b",
    )
    snapshot = session.execute(select(DiscoverSelectionSnapshot)).scalar_one()

    assert [(row.kind, row.id) for row in first.rows] == [(row.kind, row.id) for row in second.rows]
    assert snapshot.algorithm_version == "version-a"


def test_account_timezone_and_dst_boundaries_define_selection_date(
    session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    context = discover_setup["context"]
    before_utc_midnight = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Pacific/Honolulu",
        at=datetime(2026, 9, 18, 5, tzinfo=UTC),
    )
    after_local_midnight = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Pacific/Honolulu",
        at=datetime(2026, 9, 18, 11, tzinfo=UTC),
    )
    first_fold = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Europe/Berlin",
        at=datetime(2026, 10, 25, 0, 30, tzinfo=UTC),
    )
    second_fold = discover_service.read_discover(
        session,
        context,  # type: ignore[arg-type]
        account_timezone="Europe/Berlin",
        at=datetime(2026, 10, 25, 1, 30, tzinfo=UTC),
    )

    assert before_utc_midnight.selection_date == date(2026, 9, 17)
    assert after_local_midnight.selection_date == date(2026, 9, 18)
    assert first_fold.selection_date == second_fold.selection_date == date(2026, 10, 25)
    assert set(session.execute(select(DiscoverSelectionSnapshot.selection_date)).scalars()) == {
        date(2026, 9, 17),
        date(2026, 9, 18),
        date(2026, 10, 25),
    }


def test_deleted_item_disappears_without_refill_and_survivors_keep_order(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    memories = [
        _memory(session, discover_setup, index, date(2010 + index, index + 1, 1))
        for index in range(3)
    ]
    session.flush()
    before = _get(client, discover_setup).json()
    before_ids = _ordered_ids(before)
    removed_id = before_ids[1]
    removed = next(memory for memory in memories if str(memory.id) == removed_id)

    memory_service.delete_memory(
        session,
        discover_setup["context"],  # type: ignore[arg-type]
        removed.id,
        expected_version=removed.version,
    )
    session.flush()
    after_ids = _ordered_ids(_get(client, discover_setup).json())

    assert after_ids == [item_id for item_id in before_ids if item_id != removed_id]


def test_shared_to_private_disappears_without_same_day_refill(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    heart = _heart(
        session,
        discover_setup,
        date(2025, 9, 17),
        visibility=ContentVisibility.SHARED,
    )
    fallback = _memory(session, discover_setup, 1, date(2018, 1, 1))
    session.flush()
    before_ids = _ordered_ids(_get(client, discover_setup).json())
    assert str(heart.id) in before_ids
    assert str(fallback.id) in before_ids

    heart_service.change_visibility(
        session,
        discover_setup["context"],  # type: ignore[arg-type]
        heart.id,
        expected_version=heart.version,
        visibility=ContentVisibility.PRIVATE,
    )
    session.flush()
    after_ids = _ordered_ids(_get(client, discover_setup).json())

    assert after_ids == [item_id for item_id in before_ids if item_id != str(heart.id)]


def test_malformed_and_foreign_snapshot_refs_are_silently_omitted(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    local = _memory(session, discover_setup, 1, date(2020, 1, 1))
    foreign_context = AuthorizationContext(
        account_id=discover_setup["outsider"].id,
        space_id=discover_setup["foreign_space"].id,
    )
    foreign = memory_service.create_memory(
        session,
        foreign_context,
        title="Foreign",
        body="Body",
        happened_on=date(2020, 1, 2),
    )
    session.add(
        DiscoverSelectionSnapshot(
            space_id=discover_setup["space"].id,
            viewer_account_id=discover_setup["viewer"].id,
            selection_date=date(2026, 9, 17),
            algorithm_version="test",
            ordered_item_refs=[
                {"kind": "MEMORY", "itemId": str(local.id)},
                {"kind": "MEMORY", "itemId": str(foreign.id)},
                {"kind": "MEMORY", "itemId": "malformed"},
            ],
        )
    )
    session.flush()

    assert _ordered_ids(_get(client, discover_setup).json()) == [str(local.id)]


def test_owner_only_content_never_changes_partner_candidate_shape(
    session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    shared = _memory(session, discover_setup, 1, date(2020, 1, 1))
    session.flush()
    partner_context = discover_setup["partner_context"]
    before = discover_service.generate_candidates(
        session,
        partner_context,  # type: ignore[arg-type]
        date(2026, 9, 17),
    )

    private = _heart(
        session,
        discover_setup,
        date(2020, 1, 2),
        visibility=ContentVisibility.PRIVATE,
    )
    session.flush()
    after = discover_service.generate_candidates(
        session,
        partner_context,  # type: ignore[arg-type]
        date(2026, 9, 17),
    )

    assert {candidate.ref for candidate in before} == {candidate.ref for candidate in after}
    assert {candidate.ref.item_id for candidate in after} == {shared.id}
    assert private.id not in {candidate.ref.item_id for candidate in after}


def test_partner_affinity_threshold_own_view_and_removed_partner_boundaries(
    session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    memory = _memory(session, discover_setup, 1, date(2020, 1, 1))
    session.add_all(
        [
            StoryItemViewAggregate(
                space_id=discover_setup["space"].id,
                viewer_account_id=discover_setup["partner"].id,
                item_kind=StoryKind.MEMORY.value,
                item_id=memory.id,
                distinct_view_days_capped=2,
                last_counted_local_date=date(2026, 9, 16),
                last_viewed_at=FIXED_NOW,
            ),
            StoryItemViewAggregate(
                space_id=discover_setup["space"].id,
                viewer_account_id=discover_setup["viewer"].id,
                item_kind=StoryKind.MEMORY.value,
                item_id=memory.id,
                distinct_view_days_capped=5,
                last_counted_local_date=date(2026, 9, 16),
                last_viewed_at=FIXED_NOW,
            ),
            StoryItemViewAggregate(
                space_id=discover_setup["foreign_space"].id,
                viewer_account_id=discover_setup["partner"].id,
                item_kind=StoryKind.MEMORY.value,
                item_id=memory.id,
                distinct_view_days_capped=5,
                last_counted_local_date=date(2026, 9, 16),
                last_viewed_at=FIXED_NOW,
            ),
        ]
    )
    session.flush()

    below = discover_service.generate_candidates(
        session,
        discover_setup["context"],  # type: ignore[arg-type]
        date(2026, 9, 17),
    )
    assert next(item for item in below if item.ref.item_id == memory.id).affinity_score is None

    partner_row = session.get(
        StoryItemViewAggregate,
        (
            discover_setup["space"].id,
            discover_setup["partner"].id,
            StoryKind.MEMORY.value,
            memory.id,
        ),
    )
    partner_row.distinct_view_days_capped = 3
    session.flush()
    eligible = discover_service.generate_candidates(
        session,
        discover_setup["context"],  # type: ignore[arg-type]
        date(2026, 9, 17),
    )
    assert next(item for item in eligible if item.ref.item_id == memory.id).affinity_score == 3

    membership = session.execute(
        select(Membership).where(
            Membership.space_id == discover_setup["space"].id,
            Membership.account_id == discover_setup["partner"].id,
        )
    ).scalar_one()
    membership.status = MembershipStatus.REMOVED.value
    session.flush()
    removed = discover_service.generate_candidates(
        session,
        discover_setup["context"],  # type: ignore[arg-type]
        date(2026, 9, 17),
    )
    assert next(item for item in removed if item.ref.item_id == memory.id).affinity_score is None


def test_snapshot_retention_is_exactly_48_hours(session: Session, discover_setup) -> None:  # type: ignore[no-untyped-def]
    old = DiscoverSelectionSnapshot(
        space_id=discover_setup["space"].id,
        viewer_account_id=discover_setup["viewer"].id,
        selection_date=date(2026, 9, 14),
        algorithm_version="test",
        ordered_item_refs=[],
        created_at=FIXED_NOW - timedelta(hours=48, seconds=1),
    )
    current = DiscoverSelectionSnapshot(
        space_id=discover_setup["space"].id,
        viewer_account_id=discover_setup["viewer"].id,
        selection_date=date(2026, 9, 15),
        algorithm_version="test",
        ordered_item_refs=[],
        created_at=FIXED_NOW - timedelta(hours=48),
    )
    session.add_all([old, current])
    session.flush()

    assert discover_service.prune_expired_snapshots(session, at=FIXED_NOW) == 1
    assert (
        session.get(
            DiscoverSelectionSnapshot,
            (current.space_id, current.viewer_account_id, current.selection_date),
        )
        is current
    )


def test_timeline_read_does_not_materialize_discover_snapshot(
    client, session: Session, discover_setup
) -> None:  # type: ignore[no-untyped-def]
    _memory(session, discover_setup, 1, date(2020, 1, 1))
    session.flush()

    response = client.get(
        f"/api/v1/spaces/{discover_setup['space'].id}/timeline",
        headers=auth(discover_setup["token"]),
    )

    assert response.status_code == 200
    assert session.execute(select(DiscoverSelectionSnapshot)).scalars().all() == []


def test_anonymous_is_401_and_foreign_space_is_non_enumerating_404(client, discover_setup) -> None:  # type: ignore[no-untyped-def]
    path = f"/api/v1/spaces/{discover_setup['space'].id}/discover"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=auth(discover_setup["outsider_token"])).status_code == 404


def test_concurrent_first_reads_commit_one_canonical_snapshot(engine, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: FIXED_NOW)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
    monkeypatch.setattr(db_session, "get_sessionmaker", lambda: maker)
    with maker.begin() as session:
        viewer = make_account(session, "Viewer")
        partner = make_account(session, "Partner")
        space = make_space(session, viewer)
        relationship_service.add_member(session, space.id, partner)
        context = AuthorizationContext(account_id=viewer.id, space_id=space.id)
        for index in range(10):
            memory_service.create_memory(
                session,
                context,
                title=f"Memory {index}",
                body="Body",
                happened_on=date(2010 + index, (index % 12) + 1, 1),
            )
        token = sign_in(session, viewer)
        space_id = space.id
        account_ids = (viewer.id, partner.id)

    barrier = Barrier(2)

    def read() -> dict[str, object]:
        barrier.wait()
        response = client.get(
            f"/api/v1/spaces/{space_id}/discover",
            headers=auth(token),
        )
        assert response.status_code == 200, response.text
        return response.json()

    with (
        TestClient(create_app(), raise_server_exceptions=False) as client,
        ThreadPoolExecutor(max_workers=2) as executor,
    ):
        responses = list(executor.map(lambda _: read(), range(2)))

    with maker() as session:
        snapshots = session.execute(select(DiscoverSelectionSnapshot)).scalars().all()
    assert responses[0] == responses[1]
    assert len(snapshots) == 1

    with maker.begin() as session:
        from eimir.identity.models import Account
        from eimir.relationship.models import Space

        session.query(Space).filter(Space.id == space_id).delete(synchronize_session=False)
        session.query(Account).filter(Account.id.in_(account_ids)).delete(synchronize_session=False)
