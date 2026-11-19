"""Acceptance tests for repeating a completed Wish ("Nochmal erleben", #1816)."""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


def path(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}/wishes"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Foreign")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    foreign_space = make_space(session, foreign)
    relationship_service.add_member(session, foreign_space.id, ben)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "foreign_space": foreign_space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def create_completed_wish(client, couple, **content) -> dict:  # type: ignore[no-untyped-def]
    created = client.post(
        path(couple["space"].id),
        json={"title": "Baltic Sea weekend", **content},
        headers=auth(couple["token_a"]),
    )
    assert created.status_code == 201
    completed = client.post(
        f"{path(couple['space'].id)}/{created.json()['id']}/complete",
        headers=if_match(couple["token_a"], 1),
    )
    assert completed.status_code == 200
    return completed.json()


def repeat(client, couple, wish: dict, *, token_key: str = "token_a", **kwargs):  # type: ignore[no-untyped-def]
    return client.post(
        f"{path(couple['space'].id)}/{wish['id']}/repeat",
        headers=auth(couple[token_key]),
        **kwargs,
    )


def test_repeating_a_completed_wish_creates_a_linked_open_wish(client, couple, session) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(
        client, couple, description="Sunrise on the pier", tags=["sea", "weekend"]
    )

    response = repeat(client, couple, source)

    assert response.status_code == 201
    repeated = response.json()
    assert repeated["id"] != source["id"]
    assert repeated["status"] == "OPEN"
    assert repeated["version"] == 1
    assert repeated["title"] == "Baltic Sea weekend"
    assert repeated["description"] == "Sunrise on the pier"
    assert repeated["tags"] == ["sea", "weekend"]
    assert repeated["followedFromWishId"] == source["id"]
    assert repeated["seriesId"] == source["id"]
    assert repeated["seriesPosition"] == 2
    assert repeated["plan"] is None
    assert response.headers["ETag"] == '"1"'

    session.expire_all()
    original = session.get(Wish, UUID(source["id"]))
    assert original is not None
    assert original.status == WishStatus.COMPLETED.value
    assert original.version == source["version"]


def test_first_wish_starts_its_own_series(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)

    assert source["followedFromWishId"] is None
    assert source["seriesId"] == source["id"]
    assert source["seriesPosition"] == 1


def test_request_can_override_the_proposal(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple, description="Sunrise on the pier")

    response = repeat(
        client,
        couple,
        source,
        json={"title": "  Baltic Sea in winter ", "tags": ["winter"]},
    )

    assert response.status_code == 201
    repeated = response.json()
    assert repeated["title"] == "Baltic Sea in winter"
    assert repeated["tags"] == ["winter"]
    assert repeated["description"] == "Sunrise on the pier"


@pytest.mark.parametrize("status_before", ["OPEN", "PLANNED"])
def test_only_a_completed_wish_can_be_repeated(client, couple, status_before) -> None:  # type: ignore[no-untyped-def]
    created = client.post(
        path(couple["space"].id),
        json={"title": "Not done yet"},
        headers=auth(couple["token_a"]),
    ).json()
    wish = created
    if status_before == "PLANNED":
        wish = client.post(
            f"{path(couple['space'].id)}/{created['id']}/plan",
            json={},
            headers=if_match(couple["token_a"], 1),
        ).json()["wish"]

    response = repeat(client, couple, wish)

    assert response.status_code == 409
    assert response.json()["code"] == "WISH_REPEAT_REQUIRES_COMPLETED"


def test_repeats_form_a_series_with_increasing_positions(client, couple) -> None:  # type: ignore[no-untyped-def]
    first = create_completed_wish(client, couple)
    second = repeat(client, couple, first).json()
    completed_second = client.post(
        f"{path(couple['space'].id)}/{second['id']}/complete",
        headers=if_match(couple["token_a"], second["version"]),
    ).json()

    third = repeat(client, couple, completed_second).json()

    assert third["seriesId"] == first["id"]
    assert third["seriesPosition"] == 3
    assert third["followedFromWishId"] == second["id"]


def test_idempotency_key_replays_the_first_repeat(client, couple, session) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)
    headers = {**auth(couple["token_a"]), "Idempotency-Key": str(uuid4())}
    url = f"{path(couple['space'].id)}/{source['id']}/repeat"

    first = client.post(url, headers=headers)
    second = client.post(url, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    count = session.execute(
        select(func.count())
        .select_from(Wish)
        .where(Wish.followed_from_wish_id == UUID(source["id"]))
    ).scalar_one()
    assert count == 1


def test_partner_can_repeat_a_shared_wish(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)

    response = repeat(client, couple, source, token_key="token_b")

    assert response.status_code == 201
    assert response.json()["createdBy"] == str(couple["ben"].id)


def test_cross_space_wish_id_remains_invisible(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)

    response = client.post(
        f"{path(couple['foreign_space'].id)}/{source['id']}/repeat",
        headers=auth(couple["token_b"]),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "WISH_NOT_FOUND"


@pytest.mark.parametrize(
    "field",
    ["status", "followedFromWishId", "seriesId", "seriesPosition", "createdBy", "spaceId"],
)
def test_server_controlled_fields_are_rejected(client, couple, field) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)

    response = repeat(client, couple, source, json={field: str(uuid4())})

    assert response.status_code == 422


def test_blank_title_override_is_rejected(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)

    response = repeat(client, couple, source, json={"title": "   "})

    assert response.status_code == 422


def test_deleting_the_source_clears_the_link_but_keeps_the_series(client, couple) -> None:  # type: ignore[no-untyped-def]
    source = create_completed_wish(client, couple)
    repeated = repeat(client, couple, source).json()

    deleted = client.delete(
        f"{path(couple['space'].id)}/{source['id']}",
        headers=if_match(couple["token_a"], source["version"]),
    )
    assert deleted.status_code == 204

    fetched = client.get(
        f"{path(couple['space'].id)}/{repeated['id']}", headers=auth(couple["token_a"])
    )
    assert fetched.status_code == 200
    body = fetched.json()
    assert body["followedFromWishId"] is None
    assert body["seriesId"] == source["id"]
    assert body["seriesPosition"] == 2


def test_source_with_completed_plan_can_be_repeated_and_keeps_its_plan(client, couple) -> None:  # type: ignore[no-untyped-def]
    created = client.post(
        path(couple["space"].id),
        json={"title": "Sailing day"},
        headers=auth(couple["token_a"]),
    ).json()
    converted = client.post(
        f"{path(couple['space'].id)}/{created['id']}/plan",
        json={},
        headers=if_match(couple["token_a"], 1),
    ).json()
    plan = converted["plan"]
    completed = client.post(
        f"/api/v1/spaces/{couple['space'].id}/plans/{plan['id']}/complete",
        json={"experiencedOn": "2026-08-01"},
        headers=if_match(couple["token_a"], plan["version"]),
    )
    assert completed.status_code == 200
    source = client.get(
        f"{path(couple['space'].id)}/{created['id']}", headers=auth(couple["token_a"])
    ).json()
    assert source["status"] == "COMPLETED"

    response = repeat(client, couple, source)

    assert response.status_code == 201
    assert response.json()["plan"] is None
    again = client.get(
        f"{path(couple['space'].id)}/{created['id']}", headers=auth(couple["token_a"])
    ).json()
    assert again["plan"]["id"] == plan["id"]
