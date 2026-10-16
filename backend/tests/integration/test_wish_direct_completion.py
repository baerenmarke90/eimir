"""Acceptance tests for direct Wish completion without a Plan (#870)."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.outbox.models import OutboxEvent
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


def create_wish(client, couple, title: str = "See the northern lights") -> dict:  # type: ignore[no-untyped-def]
    response = client.post(
        path(couple["space"].id),
        json={"title": title},
        headers=auth(couple["token_a"]),
    )
    assert response.status_code == 201
    return response.json()


def complete_wish(client, couple, wish: dict, *, token_key: str = "token_a", version: int = 1):  # type: ignore[no-untyped-def]
    return client.post(
        f"{path(couple['space'].id)}/{wish['id']}/complete",
        headers=if_match(couple[token_key], version),
    )


def test_open_wish_can_be_completed_directly(client, couple, session) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)

    response = complete_wish(client, couple, wish)

    assert response.status_code == 200
    completed = response.json()
    assert completed["status"] == "COMPLETED"
    assert completed["version"] == 2
    assert completed["title"] == wish["title"]
    assert response.headers["ETag"] == '"2"'

    session.expire_all()
    row = session.get(Wish, UUID(wish["id"]))
    assert row is not None
    assert row.status == WishStatus.COMPLETED.value


def test_partner_can_complete_shared_wish(client, couple) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)

    response = complete_wish(client, couple, wish, token_key="token_b")

    assert response.status_code == 200
    assert response.json()["createdBy"] == str(couple["anna"].id)


def test_stale_version_wins_before_lifecycle_state(client, couple) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)
    first = complete_wish(client, couple, wish)
    assert first.status_code == 200

    stale = complete_wish(client, couple, wish, version=1)

    assert stale.status_code == 409
    assert stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"


def test_completed_wish_cannot_be_completed_again(client, couple) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)
    first = complete_wish(client, couple, wish)
    assert first.status_code == 200

    repeated = complete_wish(client, couple, wish, version=2)

    assert repeated.status_code == 409
    assert repeated.json()["code"] == "WISH_ALREADY_COMPLETED"


def test_planned_wish_must_be_completed_through_its_plan(client, couple) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)
    converted = client.post(
        f"{path(couple['space'].id)}/{wish['id']}/plan",
        json={},
        headers=if_match(couple["token_a"], 1),
    )
    assert converted.status_code == 201
    planned_wish = converted.json()["wish"]

    response = complete_wish(client, couple, planned_wish, version=planned_wish["version"])

    assert response.status_code == 409
    assert response.json()["code"] == "WISH_HAS_ACTIVE_PLAN"


def test_cross_space_wish_id_remains_invisible(client, couple) -> None:  # type: ignore[no-untyped-def]
    wish = create_wish(client, couple)

    response = client.post(
        f"{path(couple['foreign_space'].id)}/{wish['id']}/complete",
        headers=if_match(couple["token_b"], 1),
    )

    assert response.status_code == 404
    assert response.json()["code"] == "WISH_NOT_FOUND"


def test_completion_event_contains_no_wish_content(client, couple, session) -> None:  # type: ignore[no-untyped-def]
    secret_title = "Private relationship wish text"
    wish = create_wish(client, couple, title=secret_title)

    response = complete_wish(client, couple, wish, token_key="token_b")
    assert response.status_code == 200

    event = session.execute(
        select(OutboxEvent).where(OutboxEvent.event_type == "WISH_COMPLETED")
    ).scalar_one()
    assert event.actor_id == couple["ben"].id
    assert event.resource_version == 2
    assert secret_title not in repr(event.payload.model_dump())
