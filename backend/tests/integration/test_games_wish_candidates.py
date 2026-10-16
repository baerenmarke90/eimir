"""HTTP/PostgreSQL acceptance tests for #864 Wunschdetektiv candidates."""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.games.service import MAX_WISH_CANDIDATES
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishPayload, WishStatus
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


def _wish(
    session: Session,
    *,
    space_id,
    owner_id,
    title: str,
    status: WishStatus = WishStatus.OPEN,
) -> Wish:  # type: ignore[no-untyped-def]
    wish = Wish(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=status.value,
        payload=WishPayload(title=title),
    )
    session.add(wish)
    session.flush()
    return wish


def _candidates(client, couple, *, token=None, space_id=None):  # type: ignore[no-untyped-def]
    return client.get(
        f"/api/v1/spaces/{space_id or couple['space'].id}/games/wishes/candidates",
        headers=auth(token or couple["token_a"]),
    )


def test_wish_candidates_require_games_capability(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Secret premium surface",
    )

    response = _candidates(client, couple)

    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
    assert "Secret premium surface" not in response.text


def test_wish_candidates_return_only_open_wishes_with_creator_attribution(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    anna_open = _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Sterne gucken",
    )
    ben_open = _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        title="Wochenende am Meer",
    )
    _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Schon geplant",
        status=WishStatus.PLANNED,
    )
    _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["ben"].id,
        title="Schon erlebt",
        status=WishStatus.COMPLETED,
    )
    _wish(
        session,
        space_id=couple["foreign_space"].id,
        owner_id=couple["outsider"].id,
        title="Foreign wish",
    )

    response = _candidates(client, couple)

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    items = {item["wishId"]: item for item in body["items"]}
    assert set(items) == {str(anna_open.id), str(ben_open.id)}
    assert items[str(anna_open.id)] == {
        "wishId": str(anna_open.id),
        "createdBy": str(couple["anna"].id),
        "title": "Sterne gucken",
    }
    assert items[str(ben_open.id)]["createdBy"] == str(couple["ben"].id)


def test_wish_candidate_set_is_identical_for_both_partners_and_tenant_guarded(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    _wish(
        session,
        space_id=couple["space"].id,
        owner_id=couple["anna"].id,
        title="Gemeinsamer Wunsch",
    )

    anna = _candidates(client, couple, token=couple["token_a"])
    ben = _candidates(client, couple, token=couple["token_b"])
    outsider = _candidates(client, couple, token=couple["token_outsider"])

    assert anna.status_code == 200
    assert ben.status_code == 200
    assert anna.json() == ben.json()
    assert outsider.status_code == 404
    assert outsider.json()["code"] == "SPACE_NOT_FOUND"


def test_wish_candidate_pool_is_bounded_without_total(client, session: Session, couple) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    for index in range(MAX_WISH_CANDIDATES + 5):
        _wish(
            session,
            space_id=couple["space"].id,
            owner_id=couple["anna"].id if index % 2 == 0 else couple["ben"].id,
            title=f"Wish {index}",
        )

    response = _candidates(client, couple)

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {"items"}
    assert len(body["items"]) == MAX_WISH_CANDIDATES
    assert "total" not in body
    assert "count" not in body


def test_wish_candidate_pool_keeps_older_partner_wishes_when_recent_pool_is_skewed(
    client, session: Session, couple
) -> None:  # type: ignore[no-untyped-def]
    _grant_games(session, couple)
    baseline = now()

    for index in range(2):
        wish = _wish(
            session,
            space_id=couple["space"].id,
            owner_id=couple["ben"].id,
            title=f"Ben older {index}",
        )
        wish.created_at = baseline - timedelta(days=2, minutes=index)

    for index in range(MAX_WISH_CANDIDATES + 5):
        wish = _wish(
            session,
            space_id=couple["space"].id,
            owner_id=couple["anna"].id,
            title=f"Anna recent {index}",
        )
        wish.created_at = baseline + timedelta(minutes=index)
    session.flush()

    response = _candidates(client, couple)

    assert response.status_code == 200, response.text
    items = response.json()["items"]
    creators = [item["createdBy"] for item in items]
    assert creators.count(str(couple["ben"].id)) == 2
    assert creators.count(str(couple["anna"].id)) <= MAX_WISH_CANDIDATES // 2
    assert len(items) <= MAX_WISH_CANDIDATES
