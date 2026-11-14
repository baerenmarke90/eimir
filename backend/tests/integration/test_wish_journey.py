"""#1790 F2: the Wish journey is derived from existing relations, never stored.

``plan`` and ``hasMemory`` on a Wish are read-only presentation context: the
originating Plan (``Plan.sourceWishId``) with its schedule, and whether a
Memory is linked to the Wish or to that Plan. The wish/plan state machine and
the stored data stay unchanged.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from eimir.core.clock import today_in
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

ZONE = "Europe/Berlin"


def base(space_id: object) -> str:
    return f"/api/v1/spaces/{space_id}"


def if_match(token: str, version: int) -> dict[str, str]:
    return {**auth(token), "If-Match": f'"{version}"'}


@pytest.fixture
def pair(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    session.flush()
    return {
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
    }


def create_wish(client, pair, title: str) -> Any:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{base(pair['space'].id)}/wishes",
        json={"title": title},
        headers=auth(pair["token_a"]),
    )
    assert response.status_code == 201
    return response.json()


def convert(client, pair, wish: dict[str, Any], **fields: Any) -> Any:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{base(pair['space'].id)}/wishes/{wish['id']}/plan",
        json=fields,
        headers=if_match(pair["token_a"], wish["version"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def get_wish(client, pair, wish_id: str, token_key: str = "token_a") -> Any:  # type: ignore[no-untyped-def]
    response = client.get(
        f"{base(pair['space'].id)}/wishes/{wish_id}", headers=auth(pair[token_key])
    )
    assert response.status_code == 200
    return response.json()


def list_wishes(client, pair, status: str | None = None) -> Any:  # type: ignore[no-untyped-def]
    response = client.get(
        f"{base(pair['space'].id)}/wishes",
        params={"status": status} if status else {},
        headers=auth(pair["token_a"]),
    )
    assert response.status_code == 200
    return response.json()["items"]


def complete_plan(client, pair, plan: dict[str, Any]) -> Any:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{base(pair['space'].id)}/plans/{plan['id']}/complete",
        json={"experiencedOn": (today_in(ZONE) - timedelta(days=1)).isoformat()},
        headers=if_match(pair["token_a"], plan["version"]),
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_memory(client, pair) -> Any:  # type: ignore[no-untyped-def]
    response = client.post(
        f"{base(pair['space'].id)}/memories",
        json={"title": "Am See", "body": "Schön war es.", "happenedOn": "2026-06-13"},
        headers=auth(pair["token_a"]),
    )
    assert response.status_code == 201, response.text
    return response.json()


def link_memory(client, pair, memory: dict[str, Any], kind: str, target_id: str) -> None:  # type: ignore[no-untyped-def]
    response = client.put(
        f"{base(pair['space'].id)}/memories/{memory['id']}/{kind}/{target_id}",
        headers=auth(pair["token_a"]),
    )
    assert response.status_code == 204, response.text


class TestJourneyContext:
    def test_open_wish_has_no_journey(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Frühstück am See")

        assert wish["plan"] is None
        assert wish["hasMemory"] is False
        assert get_wish(client, pair, wish["id"])["plan"] is None

    def test_planned_wish_carries_its_date_only_plan(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Kochkurs zusammen")
        result = convert(client, pair, wish, schedule={"plannedOn": "2026-11-21"})

        assert result["wish"]["plan"]["id"] == result["plan"]["id"]
        detail = get_wish(client, pair, wish["id"], token_key="token_b")
        assert detail["status"] == "PLANNED"
        assert detail["plan"] == {
            "id": result["plan"]["id"],
            "status": "PLANNED",
            "plannedOn": "2026-11-21",
            "plannedStart": None,
            "experiencedOn": None,
        }
        assert detail["hasMemory"] is False

    def test_planned_wish_carries_an_exact_instant(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Flohmarkt")
        result = convert(
            client,
            pair,
            wish,
            schedule={"plannedStart": "2026-11-24T09:00:00Z"},
        )

        plan = get_wish(client, pair, wish["id"])["plan"]
        assert plan["id"] == result["plan"]["id"]
        assert plan["plannedOn"] is None
        assert plan["plannedStart"].startswith("2026-11-24T09:00:00")

    def test_undated_plan_has_neither_date(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Mit dem Nachtzug ans Meer")
        result = convert(client, pair, wish)

        plan = get_wish(client, pair, wish["id"])["plan"]
        assert plan["id"] == result["plan"]["id"]
        assert plan["status"] == "IDEA"
        assert plan["plannedOn"] is None
        assert plan["plannedStart"] is None

    def test_completion_through_plan_keeps_the_plan_and_finds_plan_memory(  # type: ignore[no-untyped-def]
        self, client, pair
    ) -> None:
        wish = create_wish(client, pair, "Wochenende am See")
        plan = convert(client, pair, wish)["plan"]
        completed = complete_plan(client, pair, plan)

        detail = get_wish(client, pair, wish["id"])
        assert detail["status"] == "COMPLETED"
        assert detail["plan"]["status"] == "COMPLETED"
        assert detail["plan"]["experiencedOn"] == completed["experiencedOn"]
        assert detail["hasMemory"] is False

        link_memory(client, pair, create_memory(client, pair), "plans", plan["id"])
        assert get_wish(client, pair, wish["id"])["hasMemory"] is True

    def test_memory_linked_to_the_wish_counts(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Konzert in Wien")
        plan = convert(client, pair, wish)["plan"]
        complete_plan(client, pair, plan)

        link_memory(client, pair, create_memory(client, pair), "wishes", wish["id"])

        assert get_wish(client, pair, wish["id"])["hasMemory"] is True

    def test_memory_on_an_open_wish_is_not_a_journey(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Nordlichter sehen")
        link_memory(client, pair, create_memory(client, pair), "wishes", wish["id"])

        assert get_wish(client, pair, wish["id"])["hasMemory"] is False

    def test_directly_completed_wish_has_no_plan(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Tanzkurs")
        response = client.post(
            f"{base(pair['space'].id)}/wishes/{wish['id']}/complete",
            headers=if_match(pair["token_a"], wish["version"]),
        )
        assert response.status_code == 200, response.text

        detail = response.json()
        assert detail["status"] == "COMPLETED"
        assert detail["plan"] is None
        assert detail["hasMemory"] is False

    def test_returned_wish_drops_the_plan(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        wish = create_wish(client, pair, "Kanu fahren")
        plan = convert(client, pair, wish)["plan"]
        response = client.post(
            f"{base(pair['space'].id)}/plans/{plan['id']}/return-to-wish",
            json={},
            headers=if_match(pair["token_a"], plan["version"]),
        )
        assert response.status_code == 200, response.text

        detail = get_wish(client, pair, wish["id"])
        assert detail["status"] == "OPEN"
        assert detail["plan"] is None


class TestJourneyList:
    def test_planned_filter_lists_planned_wishes_with_their_plans(  # type: ignore[no-untyped-def]
        self, client, pair
    ) -> None:
        create_wish(client, pair, "Offen bleiben")
        dated = create_wish(client, pair, "Kochkurs zusammen")
        undated = create_wish(client, pair, "Mit dem Nachtzug ans Meer")
        dated_plan = convert(client, pair, dated, schedule={"plannedOn": "2026-11-21"})["plan"]
        undated_plan = convert(client, pair, undated)["plan"]

        planned = {item["id"]: item for item in list_wishes(client, pair, "PLANNED")}

        assert set(planned) == {dated["id"], undated["id"]}
        assert planned[dated["id"]]["plan"]["id"] == dated_plan["id"]
        assert planned[dated["id"]]["plan"]["plannedOn"] == "2026-11-21"
        assert planned[undated["id"]]["plan"]["id"] == undated_plan["id"]
        assert planned[undated["id"]]["plan"]["plannedOn"] is None

    def test_completed_list_separates_remembered_wishes(self, client, pair) -> None:  # type: ignore[no-untyped-def]
        remembered = create_wish(client, pair, "Konzert in Wien")
        waiting = create_wish(client, pair, "Wochenende am See")
        for wish in (remembered, waiting):
            complete_plan(client, pair, convert(client, pair, wish)["plan"])
        link_memory(client, pair, create_memory(client, pair), "wishes", remembered["id"])

        completed = {item["id"]: item for item in list_wishes(client, pair, "COMPLETED")}

        assert completed[remembered["id"]]["hasMemory"] is True
        assert completed[waiting["id"]]["hasMemory"] is False
        assert all(item["plan"]["status"] == "COMPLETED" for item in completed.values())

    def test_foreign_space_plans_and_memories_never_leak(  # type: ignore[no-untyped-def]
        self, client, pair, session
    ) -> None:
        own = create_wish(client, pair, "Unser Wunsch")
        complete_plan(client, pair, convert(client, pair, own)["plan"])

        stranger = make_account(session, "Clara")
        make_space(session, stranger)
        session.flush()
        other_token = sign_in(session, stranger)
        listed = client.get(f"{base(pair['space'].id)}/wishes", headers=auth(other_token))

        assert listed.status_code == 404
