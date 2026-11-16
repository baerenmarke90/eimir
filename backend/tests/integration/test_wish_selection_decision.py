"""Deciding a revealed round (#1907 J1): manual choice and consent-based chance."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.engagement import notification_policy
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind
from eimir.outbox.models import OutboxEvent
from eimir.wish_selections.models import WishSelectionRound
from tests.conftest import requires_database
from tests.integration.test_wish_selections import actors as actors
from tests.integration.test_wish_selections import headers, path, share, start

pytestmark = [pytest.mark.integration, requires_database]


def decide(client, actors, who, token, action, **reference):  # type: ignore[no-untyped-def]
    return client.put(
        path(actors) + "/decision",
        headers=headers(actors, who, token),
        json={"action": action, **reference},
    )


def read(client, actors, who="a"):  # type: ignore[no-untyped-def]
    return client.get(path(actors), headers=headers(actors, who)).json()


def reveal(client, actors, first, second):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    share(client, actors, "a", current["selectionToken"], first)
    partner = read(client, actors, "b")
    share(client, actors, "b", partner["selectionToken"], second)
    return read(client, actors, "a"), read(client, actors, "b")


def project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


def kinds(session: Session, recipient) -> list[str]:  # type: ignore[no-untyped-def]
    return sorted(
        session.scalars(
            select(Notification.kind).where(
                Notification.recipient_account_id == recipient.id,
                Notification.kind.like("WISH_SELECTION_RANDOM%"),
            )
        )
    )


def ids(actors, indices):  # type: ignore[no-untyped-def]
    return {str(actors["sources"][index].id) for index in indices}


def test_several_common_favourites_can_be_chosen_once_for_both(client, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0, 1], [0, 1])
    assert a["randomPool"] == "COMMON" and a["decision"] is None
    chosen = decide(
        client,
        actors,
        "a",
        a["selectionToken"],
        "CHOOSE",
        wishId=str(actors["sources"][1].id),
    )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["decision"] == {
        "wishId": str(actors["sources"][1].id),
        "dateIdeaId": None,
        "method": "MANUAL",
    }
    # Both devices show the same pick; chance is no longer offered.
    partner = read(client, actors, "b")
    assert partner["decision"] == chosen.json()["decision"] and partner["randomPool"] is None
    undone = decide(client, actors, "b", partner["selectionToken"], "CLEAR")
    assert undone.status_code == 200 and undone.json()["decision"] is None


def test_choice_is_limited_to_common_favourites(client, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0, 1], [0, 1])
    rejected = decide(
        client, actors, "a", a["selectionToken"], "CHOOSE", wishId=str(actors["sources"][2].id)
    )
    assert rejected.status_code == 422
    assert rejected.json()["code"] == "WISH_SELECTION_DECISION_INVALID"


def test_chance_needs_the_partners_consent_and_draws_from_the_pool_once(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0], [1])
    # No common favourite: chance chooses among both partners' favourites.
    assert a["commonWishIds"] == [] and a["randomPool"] == "FAVORITES"
    asked = decide(client, actors, "a", a["selectionToken"], "REQUEST_RANDOM")
    assert asked.status_code == 200, asked.text
    assert asked.json()["randomRequest"] == {"mine": True, "declined": False}
    assert asked.json()["decision"] is None
    project(session)
    assert kinds(session, actors["second"]) == ["WISH_SELECTION_RANDOM_REQUESTED"]
    unread_with_request = engagement.unread_count(session, actors["b"])
    partner = read(client, actors, "b")
    assert partner["randomRequest"] == {"mine": False, "declined": False}
    agreed = decide(client, actors, "b", partner["selectionToken"], "ACCEPT_RANDOM")
    assert agreed.status_code == 200, agreed.text
    decision = agreed.json()["decision"]
    assert decision["method"] == "RANDOM" and decision["wishId"] in ids(actors, [0, 1])
    assert agreed.json()["randomRequest"] is None
    # Stored once: both partners read the same result and the pool is never listed.
    assert read(client, actors, "a")["decision"] == decision
    project(session)
    assert kinds(session, actors["first"]) == ["WISH_SELECTION_RANDOM_ACCEPTED"]
    # The partner's request notice is no longer current once chance decided.
    assert engagement.unread_count(session, actors["b"]) == unread_with_request - 1


def test_two_requests_count_as_consent(client, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0, 1], [0, 1])
    decide(client, actors, "a", a["selectionToken"], "REQUEST_RANDOM")
    partner = read(client, actors, "b")
    both = decide(client, actors, "b", partner["selectionToken"], "REQUEST_RANDOM")
    assert both.status_code == 200
    assert both.json()["decision"]["method"] == "RANDOM"
    assert both.json()["decision"]["wishId"] in ids(actors, [0, 1])


def test_decline_is_in_app_only_and_withdraw_is_silent(client, session: Session, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0], [1])
    decide(client, actors, "a", a["selectionToken"], "REQUEST_RANDOM")
    partner = read(client, actors, "b")
    declined = decide(client, actors, "b", partner["selectionToken"], "DECLINE_RANDOM")
    assert declined.status_code == 200
    assert declined.json()["randomRequest"] == {"mine": False, "declined": True}
    assert read(client, actors, "a")["randomRequest"] == {"mine": True, "declined": True}
    project(session)
    assert kinds(session, actors["first"]) == ["WISH_SELECTION_RANDOM_DECLINED"]
    assert not notification_policy.for_kind(
        NotificationKind.WISH_SELECTION_RANDOM_DECLINED.value
    ).push_immediately
    # Asking again replaces the declined note; withdrawing leaves no trace.
    own = read(client, actors, "a")
    again = decide(client, actors, "a", own["selectionToken"], "REQUEST_RANDOM")
    assert again.json()["randomRequest"] == {"mine": True, "declined": False}
    withdrawn = decide(client, actors, "a", again.json()["selectionToken"], "WITHDRAW_RANDOM")
    assert withdrawn.status_code == 200 and withdrawn.json()["randomRequest"] is None


def test_changing_favourites_or_a_new_round_cancels_request_and_decision(
    client, session: Session, actors
):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0], [1])
    asked = decide(client, actors, "a", a["selectionToken"], "REQUEST_RANDOM").json()
    changed = share(client, actors, "a", asked["selectionToken"], [0, 1])
    assert changed.status_code == 200
    assert changed.json()["randomRequest"] is None
    round = session.scalar(select(WishSelectionRound))
    assert round is not None and round.random_requested_by is None
    now = read(client, actors, "a")
    replaced = client.put(
        path(actors),
        headers=headers(actors, version=now["roundToken"]),
        json={"wishIds": [str(item.id) for item in actors["sources"][:2]]},
    )
    assert replaced.status_code == 200
    assert replaced.json()["decision"] is None and replaced.json()["randomRequest"] is None


def test_one_common_favourite_is_already_decided_and_offers_no_chance(client, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [0, 1], [1, 2])
    assert a["commonWishIds"] == [str(actors["sources"][1].id)]
    assert a["randomPool"] is None
    rejected = decide(client, actors, "a", a["selectionToken"], "REQUEST_RANDOM")
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "WISH_SELECTION_DECISION_UNAVAILABLE"


def test_nobody_marked_a_favourite_so_chance_may_choose_from_every_idea(client, actors):  # type: ignore[no-untyped-def]
    a, _ = reveal(client, actors, [], [])
    assert a["randomPool"] == "ALL"


def test_decisions_need_a_revealed_round_and_the_current_token(client, actors):  # type: ignore[no-untyped-def]
    current = start(client, actors)
    early = decide(client, actors, "a", current["selectionToken"], "REQUEST_RANDOM")
    assert early.status_code == 409
    a, _ = reveal_after_start(client, actors, current)
    stale = decide(client, actors, "a", current["selectionToken"], "REQUEST_RANDOM")
    assert stale.status_code == 409 and stale.json()["code"] == "RESOURCE_VERSION_CONFLICT"
    outsider = decide(client, actors, "outsider", a["selectionToken"], "REQUEST_RANDOM")
    assert outsider.status_code == 404


def reveal_after_start(client, actors, current):  # type: ignore[no-untyped-def]
    share(client, actors, "a", current["selectionToken"], [0])
    partner = read(client, actors, "b")
    share(client, actors, "b", partner["selectionToken"], [1])
    return read(client, actors, "a"), read(client, actors, "b")
