"""Typed date-idea candidates in the shared Wish selection (#465 folded into #1535).

Real PostgreSQL/HTTP acceptance for the Pro boundary, privacy, downgrade,
catalog changes and export of curated date ideas inside the one existing
selection lifecycle.
"""

from __future__ import annotations

import json
from uuid import UUID
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.date_ideas.catalog import get_catalog
from eimir.domain.events import EventType
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.outbox.models import OutboxEvent
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from eimir.transfer import service as transfer
from eimir.transfer.models import TransferScope
from eimir.wish_selections.models import WishSelectionCandidate, WishSelectionRound
from eimir.wishes import service as wishes
from eimir.wishes.models import Wish
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

IDEAS = ["eimir-date-001", "eimir-date-002", "eimir-date-003"]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    first = make_account(session, "First")
    second = make_account(session, "Second")
    outsider = make_account(session, "Outsider")
    space = make_space(session, first)
    relationship.add_member(session, space.id, second)
    foreign = make_space(session, outsider)
    context = AuthorizationContext(first.id, space.id)
    sources = [wishes.create_wish(session, context, title=f"Wish {index}") for index in range(2)]
    session.flush()
    return {
        "first": first,
        "second": second,
        "space": space,
        "foreign": foreign,
        "sources": sources,
        "token_a": sign_in(session, first),
        "token_b": sign_in(session, second),
        "token_outsider": sign_in(session, outsider),
    }


def _grant(session: Session, couple):  # type: ignore[no-untyped-def]
    grant = entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["first"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.PLANNING_DATE_INSPIRATION.value],
    )
    session.flush()
    return grant


def path(couple) -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/wish-selection"


def headers(couple, who="a", version=None):  # type: ignore[no-untyped-def]
    result = auth(couple[f"token_{who}"])
    if version is not None:
        result["If-Match"] = str(version)
    return result


def start_mixed(client, couple, ideas=IDEAS, token="absent"):  # type: ignore[no-untyped-def]
    return client.put(
        path(couple),
        headers=headers(couple, version=token),
        json={
            "wishIds": [str(item.id) for item in couple["sources"]],
            "dateIdeaIds": ideas,
            "title": "Our evening",
        },
    )


def share(client, couple, who, token, wish_indices, ideas, published=True):  # type: ignore[no-untyped-def]
    return client.put(
        path(couple) + "/own",
        headers=headers(couple, who, token),
        json={
            "favoriteWishIds": [str(couple["sources"][i].id) for i in wish_indices],
            "favoriteDateIdeaIds": ideas,
            "published": published,
        },
    )


def test_free_space_cannot_add_date_ideas_but_keeps_wish_rounds(client, session: Session, couple):  # type: ignore[no-untyped-def]
    title = get_catalog().idea(IDEAS[0], "de").title
    for who in ("a", "b"):
        denied = client.put(
            path(couple),
            headers=headers(couple, who, "absent"),
            json={"wishIds": [str(couple["sources"][0].id)], "dateIdeaIds": IDEAS[:1]},
        )
        assert denied.status_code == 403
        assert denied.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
        assert title not in denied.text
    assert session.scalar(select(func.count()).select_from(WishSelectionRound)) == 0
    free = client.put(
        path(couple),
        headers=headers(couple, version="absent"),
        json={"wishIds": [str(item.id) for item in couple["sources"]]},
    )
    assert free.status_code == 200
    assert free.json()["dateIdeaCandidates"] == []
    assert free.json()["resultState"] == "CHOOSING"


def test_both_partners_choose_mixed_round_privately_and_see_only_the_intersection(
    client, session: Session, couple
):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    started = start_mixed(client, couple)
    assert started.status_code == 200, started.text
    body = started.json()
    assert [item["wishId"] for item in body["candidates"]] == [
        str(item.id) for item in couple["sources"]
    ]
    assert [item["dateIdeaId"] for item in body["dateIdeaCandidates"]] == IDEAS
    english = client.get(path(couple), params={"locale": "en"}, headers=headers(couple, "b"))
    first_idea = english.json()["dateIdeaCandidates"][0]
    assert first_idea["current"] is True
    assert first_idea["idea"]["title"] == get_catalog().idea(IDEAS[0], "en").title
    assert first_idea["idea"]["image"]["id"]
    assert english.headers["cache-control"] == "private, no-store"

    first = share(client, couple, "a", body["selectionToken"], [0], IDEAS[:2])
    assert first.status_code == 200, first.text
    assert first.json()["resultState"] == "WAITING"
    assert first.json()["own"]["favoriteDateIdeaIds"] == IDEAS[:2]
    partner = client.get(path(couple), headers=headers(couple, "b")).json()
    assert partner["own"]["favoriteDateIdeaIds"] == []
    assert partner["own"]["favoriteWishIds"] == []
    assert partner["commonDateIdeaIds"] == [] and partner["resultState"] == "CHOOSING"
    assert IDEAS[1] not in json.dumps(partner["own"])

    matched = share(client, couple, "b", partner["selectionToken"], [0, 1], IDEAS[1:])
    assert matched.json()["resultState"] == "READY"
    assert matched.json()["commonDateIdeaIds"] == [IDEAS[1]]
    assert matched.json()["commonWishIds"] == [str(couple["sources"][0].id)]
    # A repeated publication is not a second result notification.
    repeated = share(client, couple, "b", matched.json()["selectionToken"], [0, 1], IDEAS[1:])
    assert repeated.status_code == 200
    ready_events = session.scalar(
        select(func.count())
        .select_from(OutboxEvent)
        .where(OutboxEvent.event_type == EventType.WISH_SELECTION_READY.value)
    )
    assert ready_events == 1
    # A common date idea is only a decision: nothing became a Wish or Plan.
    assert session.scalar(select(func.count()).select_from(Plan)) == 0
    assert (
        session.scalar(
            select(func.count()).select_from(Wish).where(Wish.space_id == couple["space"].id)
        )
        == 2
    )


@pytest.mark.parametrize(
    "body",
    [
        {"dateIdeaIds": IDEAS[:1]},
        {"wishIds": [], "dateIdeaIds": []},
        {"dateIdeaIds": [IDEAS[0], IDEAS[0]]},
        {"dateIdeaIds": ["eimir-date-201", IDEAS[0]]},
        {"dateIdeaIds": ["not-a-catalog-id", IDEAS[0]]},
    ],
)
def test_candidate_bounds_and_catalog_references_are_validated(
    client, session: Session, couple, body
):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    result = client.put(path(couple), headers=headers(couple, version="absent"), json=body)
    assert result.status_code == 422


def test_more_than_five_typed_candidates_are_rejected(client, session: Session, couple):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    result = start_mixed(client, couple, ideas=[f"eimir-date-00{index}" for index in range(1, 5)])
    assert result.status_code == 422
    assert result.json()["code"] == "WISH_SELECTION_CANDIDATES_INVALID"
    ideas_only = client.put(
        path(couple),
        headers=headers(couple, version="absent"),
        json={"dateIdeaIds": IDEAS[:2]},
    )
    assert ideas_only.status_code == 200
    assert ideas_only.json()["candidates"] == []


def test_favorites_must_name_round_ideas_and_cannot_be_omitted(client, session: Session, couple):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    token = start_mixed(client, couple).json()["selectionToken"]
    for ideas in (["eimir-date-004"], [IDEAS[0], IDEAS[0]]):
        result = share(client, couple, "a", token, [], ideas)
        assert result.status_code == 422
        assert result.json()["code"] == "WISH_SELECTION_FAVORITES_INVALID"
    # A client without typed candidates must not publish about ideas it never showed.
    omitted = client.put(
        path(couple) + "/own",
        headers=headers(couple, version=token),
        json={"favoriteWishIds": [], "published": True},
    )
    assert omitted.status_code == 422


def test_downgrade_pauses_without_catalog_content_and_pro_resumes(client, session: Session, couple):  # type: ignore[no-untyped-def]
    grant = _grant(session, couple)
    body = start_mixed(client, couple).json()
    first = share(client, couple, "a", body["selectionToken"], [0], IDEAS[:1]).json()
    partner = client.get(path(couple), headers=headers(couple, "b")).json()
    share(client, couple, "b", partner["selectionToken"], [0], IDEAS[:1])
    entitlement_service.revoke_grant(session, grant.id)

    title = get_catalog().idea(IDEAS[0], "de").title
    for who in ("a", "b"):
        paused = client.get(path(couple), headers=headers(couple, who))
        assert paused.status_code == 200
        data = paused.json()
        assert data["resultState"] == "PAUSED"
        assert data["commonDateIdeaIds"] == [] and data["commonWishIds"] == []
        assert all(item["idea"] is None for item in data["dateIdeaCandidates"])
        assert title not in paused.text
        # Ordinary Wish candidates and their titles stay readable.
        assert [item["title"] for item in data["candidates"]] == ["Wish 0", "Wish 1"]
    blocked = share(client, couple, "a", first["selectionToken"], [0], IDEAS[:1])
    assert blocked.status_code == 403
    assert blocked.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"

    # Restoring Pro continues the same valid round with its published choices.
    restored = _grant(session, couple)
    resumed = client.get(path(couple), headers=headers(couple)).json()
    assert resumed["resultState"] == "READY"
    assert resumed["commonDateIdeaIds"] == [IDEAS[0]]
    entitlement_service.revoke_grant(session, restored.id)
    # A deliberately confirmed Free replacement keeps every Wish and Plan.
    replaced = client.put(
        path(couple),
        headers=headers(couple, version=resumed["roundToken"]),
        json={"wishIds": [str(item.id) for item in couple["sources"]]},
    )
    assert replaced.status_code == 200
    assert replaced.json()["resultState"] == "CHOOSING"
    assert replaced.json()["dateIdeaCandidates"] == []
    assert (
        session.scalar(
            select(func.count()).select_from(Wish).where(Wish.space_id == couple["space"].id)
        )
        == 2
    )


def test_changed_or_removed_catalog_entries_require_review(client, session: Session, couple):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    body = start_mixed(client, couple).json()
    round_id = UUID(body["id"])
    session.execute(
        update(WishSelectionCandidate)
        .where(
            WishSelectionCandidate.round_id == round_id,
            WishSelectionCandidate.date_idea_id == IDEAS[0],
        )
        .values(date_idea_revision="0" * 64)
    )
    changed = client.get(path(couple), headers=headers(couple)).json()
    assert changed["resultState"] == "NEEDS_IDEAS"
    first = next(item for item in changed["dateIdeaCandidates"] if item["dateIdeaId"] == IDEAS[0])
    assert first["current"] is False and first["idea"]["id"] == IDEAS[0]
    stale = share(client, couple, "a", body["selectionToken"], [], IDEAS[:1])
    assert stale.status_code == 409
    assert stale.json()["code"] == "WISH_SELECTION_SOURCES_CHANGED"

    session.execute(
        update(WishSelectionCandidate)
        .where(
            WishSelectionCandidate.round_id == round_id,
            WishSelectionCandidate.date_idea_id == IDEAS[0],
        )
        .values(date_idea_id="eimir-date-999")
    )
    removed = client.get(path(couple), headers=headers(couple)).json()
    gone = next(
        item for item in removed["dateIdeaCandidates"] if item["dateIdeaId"] == "eimir-date-999"
    )
    assert gone == {"dateIdeaId": "eimir-date-999", "current": False, "idea": None}
    review = client.put(
        path(couple),
        headers=headers(couple, version=removed["roundToken"]),
        json={"wishIds": [str(couple["sources"][0].id)], "dateIdeaIds": IDEAS[1:]},
    )
    assert review.status_code == 200 and review.json()["resultState"] == "CHOOSING"


def test_old_round_tokens_and_foreign_spaces_stay_isolated(client, session: Session, couple):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    body = start_mixed(client, couple).json()
    replaced = client.put(
        path(couple),
        headers=headers(couple, version=body["roundToken"]),
        json={"dateIdeaIds": IDEAS[:2]},
    ).json()
    assert share(client, couple, "a", body["selectionToken"], [], IDEAS[:1]).status_code == 409
    assert start_mixed(client, couple, token=body["roundToken"]).status_code == 409
    assert replaced["candidates"] == []
    outsider = client.get(path(couple), headers=headers(couple, "outsider"))
    assert outsider.status_code == 404
    assert get_catalog().idea(IDEAS[0], "de").title not in outsider.text
    foreign = client.put(
        f"/api/v1/spaces/{couple['foreign'].id}/wish-selection",
        headers=headers(couple, "outsider", "absent"),
        json={"dateIdeaIds": IDEAS[:2]},
    )
    # The grant belongs to one Space; another Space stays Free.
    assert foreign.status_code == 403


def test_export_has_catalog_references_without_copy_or_partner_choices(
    client, session: Session, couple
):  # type: ignore[no-untyped-def]
    _grant(session, couple)
    body = start_mixed(client, couple).json()
    share(client, couple, "a", body["selectionToken"], [], IDEAS[:2])
    partner = client.get(path(couple), headers=headers(couple, "b")).json()
    share(client, couple, "b", partner["selectionToken"], [], IDEAS[1:])
    context = AuthorizationContext(couple["second"].id, couple["space"].id)
    title = get_catalog().idea(IDEAS[0], "de").title
    for scope in [TransferScope.SHARED, TransferScope.PERSONAL]:
        with (
            transfer.build_export_archive(session, context, scope) as bundle,
            ZipFile(bundle) as archive,
        ):
            raw = archive.read("accounts.json").decode()
        snapshot = json.loads(raw)["wishSelection"]
        assert snapshot["dateIdeaIds"] == IDEAS
        assert snapshot["commonDateIdeaIds"] == [IDEAS[1]]
        assert title not in raw
        if scope is TransferScope.PERSONAL:
            assert snapshot["ownSelection"]["favoriteDateIdeaIds"] == IDEAS[1:]
        else:
            assert "ownSelection" not in snapshot


def test_without_the_plugin_a_round_with_date_ideas_pauses_and_keeps_its_data(  # type: ignore[no-untyped-def]
    client, session: Session, couple
):
    """Decision 0017: without the catalog source the round pauses; nothing is deleted."""
    from tests.support.plugins import without_plugins

    _grant(session, couple)
    body = start_mixed(client, couple).json()
    share(client, couple, "a", body["selectionToken"], [0], IDEAS[:1])
    title = get_catalog().idea(IDEAS[0], "de").title
    with without_plugins():
        paused = client.get(path(couple), headers=headers(couple))
        assert paused.status_code == 200
        data = paused.json()
        assert data["resultState"] == "PAUSED"
        assert [item["dateIdeaId"] for item in data["dateIdeaCandidates"]] == IDEAS
        assert all(item["idea"] is None for item in data["dateIdeaCandidates"])
        assert title not in paused.text
        assert [item["title"] for item in data["candidates"]] == ["Wish 0", "Wish 1"]
    resumed = client.get(path(couple), headers=headers(couple)).json()
    assert resumed["resultState"] != "PAUSED"
