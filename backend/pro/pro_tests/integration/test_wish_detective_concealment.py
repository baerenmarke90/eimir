"""The guesser cannot find the answer of an open Wish detective game (#2158 H).

While a remote game is open, the partner's Wishes that may still be the answer
are hidden from the reader in every Core read model that shows Wish content
(list, detail, Search, Wir, activity, the one-phone pool, Wish selection) and
the reader's own writes to them are refused. A Wish is revealed with its round,
the rest when the partner has no clue round left or the game is over. Without
the plugin nothing is hidden.
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core.clock import now
from eimir.engagement import service as engagement
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from eimir.wishes.models import Wish, WishPayload, WishStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import without_plugins

pytestmark = [pytest.mark.integration, requires_database]

# Localized product fixtures (wish titles).
BALLOON = "Heißluftballon über den Alpen"
CABIN = "Hütte im Schnee"
CONCERT = "Konzert in Wien"
PLANNED = "Kochkurs zu zweit"


@pytest.fixture
def couple(session: Session) -> dict[str, Any]:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    entitlement_service.record_grant(
        session,
        space_id=space.id,
        account_id=anna.id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now(),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "a": auth(sign_in(session, anna)),
        "b": auth(sign_in(session, ben)),
    }


def _wish(
    session: Session,
    couple: dict[str, Any],
    who: str,
    title: str,
    status: WishStatus = WishStatus.OPEN,
) -> Wish:
    wish = Wish(
        space_id=couple["space"].id,
        owner_id=couple["anna" if who == "a" else "ben"].id,
        privacy_class=PrivacyClass.SPACE_SHARED.value,
        status=status.value,
        payload=WishPayload(title=title, description=f"Mehr über {title}", tags=[title.split()[0]]),
    )
    session.add(wish)
    session.flush()
    return wish


def _space(couple: dict[str, Any], suffix: str) -> str:
    return f"/api/v1/spaces/{couple['space'].id}{suffix}"


def _game(client: Any, couple: dict[str, Any], who: str) -> dict[str, Any]:
    response = client.get(_space(couple, "/games/wish-detective"), headers=couple[who])
    assert response.status_code == 200, response.text
    game: dict[str, Any] = response.json()["game"]
    return game


def _start(client: Any, couple: dict[str, Any]) -> dict[str, Any]:
    response = client.post(_space(couple, "/games/wish-detective"), headers=couple["a"])
    assert response.status_code == 200, response.text
    game: dict[str, Any] = response.json()["game"]
    return game


def _play_round(client: Any, couple: dict[str, Any], giver: str, guesser: str) -> dict[str, Any]:
    game = _game(client, couple, giver)
    given = client.post(
        _space(couple, "/games/wish-detective/clues"),
        headers=couple[giver],
        json={
            "gameId": game["id"],
            "round": game["current"]["round"],
            "clues": ["Sonne", "Mond", "Regen"],
        },
    )
    assert given.status_code == 200, given.text
    passed = client.post(
        _space(couple, "/games/wish-detective/guesses"),
        headers=couple[guesser],
        json={"gameId": game["id"], "round": game["current"]["round"]},
    )
    assert passed.status_code == 200, passed.text
    result: dict[str, Any] = passed.json()["game"]
    return result


def _listed(client: Any, couple: dict[str, Any], who: str) -> dict[str, dict[str, Any]]:
    response = client.get(_space(couple, "/wishes?limit=100"), headers=couple[who])
    assert response.status_code == 200, response.text
    return {item["id"]: item for item in response.json()["items"]}


def _hidden(client: Any, couple: dict[str, Any], who: str) -> set[str]:
    return {
        wish_id
        for wish_id, item in _listed(client, couple, who).items()
        if item["hiddenDuringGame"]
    }


def _project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent)
        .where(OutboxEvent.processed_at.is_(None))
        .order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
        event.processed_at = now()
    session.flush()


def test_the_guesser_sees_placeholders_for_the_partners_open_wishes(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    balloon = _wish(session, couple, "a", BALLOON)
    cabin = _wish(session, couple, "a", CABIN)
    planned = _wish(session, couple, "a", PLANNED, WishStatus.PLANNED)
    concert = _wish(session, couple, "b", CONCERT)
    _start(client, couple)

    listed = _listed(client, couple, "b")
    response = client.get(_space(couple, "/wishes?limit=100"), headers=couple["b"])
    for secret in (BALLOON, CABIN, "Heißluftballon", "Hütte", f"Mehr über {CABIN}"):
        assert secret not in response.text
    # Every one of Anna's open wishes may still be drawn, not only the current one.
    assert {str(balloon.id), str(cabin.id)} == _hidden(client, couple, "b")
    placeholder = listed[str(balloon.id)]
    assert placeholder["title"] == "" and placeholder["description"] is None
    assert placeholder["tags"] == [] and placeholder["seriesId"] == str(balloon.id)
    assert placeholder["createdBy"] == str(couple["anna"].id)
    assert placeholder["creator"]["displayName"] == "Anna"
    assert placeholder["capabilities"] == {
        "canEdit": False,
        "canDelete": False,
        "canComment": False,
    }
    # Ben's own wishes and Anna's planned wish are no riddle.
    assert listed[str(concert.id)]["title"] == CONCERT
    assert listed[str(planned.id)]["title"] == PLANNED

    detail = client.get(_space(couple, f"/wishes/{cabin.id}"), headers=couple["b"])
    assert detail.status_code == 200, detail.text
    assert detail.json()["hiddenDuringGame"] is True and CABIN not in detail.text

    # The owner always sees her own wishes; Ben's are hidden from her in turn,
    # because she guesses his wish in the next round.
    own = _listed(client, couple, "a")
    assert own[str(balloon.id)]["title"] == BALLOON
    assert own[str(balloon.id)]["hiddenDuringGame"] is False
    assert _hidden(client, couple, "a") == {str(concert.id)}


def test_the_guesser_cannot_search_plan_or_pool_a_hidden_wish(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    balloon = _wish(session, couple, "a", BALLOON)
    concert = _wish(session, couple, "b", CONCERT)
    _wish(session, couple, "b", CABIN)
    _start(client, couple)

    search = client.get(_space(couple, "/search?q=Heißluftballon"), headers=couple["b"])
    assert search.status_code == 200, search.text
    assert search.json()["items"] == []
    by_tag = client.get(_space(couple, "/search?q=%23Heißluftballon"), headers=couple["b"])
    assert str(balloon.id) not in by_tag.text
    assert (
        BALLOON in client.get(_space(couple, "/search?q=Heißluftballon"), headers=couple["a"]).text
    )

    pool = client.get(_space(couple, "/games/wishes/candidates"), headers=couple["b"])
    assert pool.status_code == 200, pool.text
    assert BALLOON not in pool.text and CONCERT in pool.text

    dashboard = client.get(_space(couple, "/dashboard"), headers=couple["b"])
    assert dashboard.status_code == 200, dashboard.text
    assert BALLOON not in dashboard.text

    selection = client.put(
        _space(couple, "/wish-selection"),
        headers={**couple["b"], "If-Match": "absent"},
        json={"wishIds": [str(balloon.id), str(concert.id)]},
    )
    assert selection.status_code == 422, selection.text
    assert selection.json()["code"] == "WISH_SELECTION_CANDIDATES_INVALID"


def test_the_guessers_writes_to_a_hidden_wish_are_refused(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    balloon = _wish(session, couple, "a", BALLOON)
    _wish(session, couple, "b", CONCERT)
    _start(client, couple)
    version = {"If-Match": f'"{balloon.version}"'}
    item = _space(couple, f"/wishes/{balloon.id}")

    attempts = [
        client.patch(item, headers={**couple["b"], **version}, json={"title": "Geraten"}),
        client.post(f"{item}/complete", headers={**couple["b"], **version}),
        client.delete(item, headers={**couple["b"], **version}),
    ]
    for refused in attempts:
        assert refused.status_code == 409, refused.text
        assert refused.json()["code"] == "WISH_HIDDEN_DURING_GAME"
        assert BALLOON not in refused.text
    session.refresh(balloon)
    assert balloon.payload.title == BALLOON and balloon.status == WishStatus.OPEN.value

    # The owner keeps editing her own wish while the game runs.
    edited = client.patch(
        item, headers={**couple["a"], **version}, json={"description": "Im Sommer"}
    )
    assert edited.status_code == 200, edited.text


def test_a_new_wish_of_the_partner_stays_untitled_in_the_activity(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    _wish(session, couple, "a", CABIN)
    _wish(session, couple, "b", CONCERT)
    _start(client, couple)
    created = client.post(
        _space(couple, "/wishes"),
        headers={**couple["a"], "Idempotency-Key": str(uuid4())},
        json={"title": BALLOON},
    )
    assert created.status_code == 201, created.text
    _project(session)

    activity = client.get(_space(couple, "/activity"), headers=couple["b"])
    assert activity.status_code == 200, activity.text
    [item] = [
        entry for entry in activity.json()["items"] if entry["targetId"] == created.json()["id"]
    ]
    assert item["target"]["title"] is None
    assert BALLOON not in activity.text


def test_wishes_are_revealed_with_their_round_and_at_the_end(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    anna_wishes = {str(_wish(session, couple, "a", title).id) for title in (BALLOON, CABIN)}
    ben_wishes = {str(_wish(session, couple, "b", title).id) for title in (CONCERT, PLANNED)}
    game = _start(client, couple)
    assert game["roundsTotal"] == 4
    first = game["current"]["wish"]["wishId"]

    after_first = _play_round(client, couple, "a", "b")
    # The played wish is revealed; Anna's other wish may still be drawn.
    assert _hidden(client, couple, "b") == anna_wishes - {first}
    assert _listed(client, couple, "b")[first]["title"] in {BALLOON, CABIN}
    assert after_first["current"]["giverId"] == str(couple["ben"].id)

    _play_round(client, couple, "b", "a")
    _play_round(client, couple, "a", "b")
    # Anna gave both her rounds: none of her wishes can be drawn any more.
    assert _hidden(client, couple, "b") == set()
    assert len(_hidden(client, couple, "a")) == 1
    finished = _play_round(client, couple, "b", "a")
    assert finished["status"] == "FINISHED"
    assert _hidden(client, couple, "a") == set()
    assert ben_wishes <= set(_listed(client, couple, "a"))


def test_ending_the_game_reveals_everything(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    _wish(session, couple, "a", BALLOON)
    _wish(session, couple, "b", CONCERT)
    game = _start(client, couple)
    assert _hidden(client, couple, "b")
    ended = client.post(
        _space(couple, "/games/wish-detective/end"),
        headers=couple["b"],
        json={"gameId": game["id"]},
    )
    assert ended.status_code == 200, ended.text
    assert _hidden(client, couple, "b") == set()
    assert BALLOON in client.get(_space(couple, "/wishes"), headers=couple["b"]).text


def test_without_the_plugin_nothing_is_hidden(
    client: Any, session: Session, couple: dict[str, Any]
) -> None:
    balloon = _wish(session, couple, "a", BALLOON)
    _wish(session, couple, "b", CONCERT)
    _start(client, couple)
    assert _hidden(client, couple, "b") == {str(balloon.id)}
    with without_plugins():
        assert _hidden(client, couple, "b") == set()
        assert BALLOON in client.get(_space(couple, "/wishes"), headers=couple["b"]).text
        edited = client.patch(
            _space(couple, f"/wishes/{balloon.id}"),
            headers={**couple["b"], "If-Match": f'"{balloon.version}"'},
            json={"description": "Im Sommer"},
        )
        assert edited.status_code == 200, edited.text
