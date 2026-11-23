"""Games that wait on the reader, for the Wir module (#2158 C).

Each game's "my action pending" rule, the Premium gate, the partner's
perspective and that no game content leaves the read.
"""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from eimir_pro.couple_games import service as couple_games
from eimir_pro.couple_games.models import CoupleGame, CoupleGamePayload, CoupleGameStatus
from eimir_pro.garden.models import GardenBouquet, GardenPlant
from eimir_pro.heart_hunt.models import HeartHuntRound, HeartRoundState
from eimir_pro.picture_ping_pong import service as picture_ping_pong
from eimir_pro.picture_ping_pong.models import PictureStatus
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    outsider = make_account(session, "Outsider")
    make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "outsider": outsider,
        "a": sign_in(session, anna),
        "b": sign_in(session, ben),
        "outside": sign_in(session, outsider),
        "ctx_a": AuthorizationContext(account_id=anna.id, space_id=space.id),
        "ctx_b": AuthorizationContext(account_id=ben.id, space_id=space.id),
    }


@pytest.fixture
def premium(session: Session, couple):  # type: ignore[no-untyped-def]
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
    return couple


def _waiting(client, couple, who="a"):  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/games/waiting", headers=auth(couple[who])
    )
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "private, no-store"
    return [(item["game"], item["reason"]) for item in response.json()["items"]]


def test_nothing_waits_in_a_quiet_space(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _waiting(client, premium) == []
    assert _waiting(client, premium, "b") == []


def test_without_couple_games_the_read_is_refused(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{couple['space'].id}/games/waiting", headers=auth(couple["a"])
    )
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_another_space_is_not_found(client, premium) -> None:  # type: ignore[no-untyped-def]
    response = client.get(
        f"/api/v1/spaces/{premium['space'].id}/games/waiting", headers=auth(premium["outside"])
    )
    assert response.status_code == 404


def test_who_of_us_waits_on_each_partner_until_they_answered_everything(
    client, session, premium
) -> None:  # type: ignore[no-untyped-def]
    game = couple_games.start_who_of_us(session, premium["ctx_a"])
    # Both still answer: the game waits on both of them.
    assert _waiting(client, premium) == [("WHO_OF_US", "ANSWER")]
    assert _waiting(client, premium, "b") == [("WHO_OF_US", "ANSWER")]
    assert game.payload.who_of_us is not None
    for question in game.payload.who_of_us.question_ids:
        couple_games.answer_who_of_us(
            session,
            premium["ctx_a"],
            game_id=game.id,
            question_id=question,
            partner_id=premium["anna"].id,
        )
    # Anna is done; only Ben is waited on now.
    assert _waiting(client, premium) == []
    assert _waiting(client, premium, "b") == [("WHO_OF_US", "ANSWER")]
    for question in game.payload.who_of_us.question_ids:
        couple_games.answer_who_of_us(
            session,
            premium["ctx_b"],
            game_id=game.id,
            question_id=question,
            partner_id=premium["anna"].id,
        )
    # A finished game's fresh result is not an action.
    assert game.status == CoupleGameStatus.FINISHED.value
    assert _waiting(client, premium) == []
    assert _waiting(client, premium, "b") == []


@pytest.mark.parametrize("game_kind", ["WISH_DETECTIVE", "OUR_MOMENTS"])
def test_turn_based_couple_games_wait_on_whose_turn_it_is(
    client, session, premium, game_kind
) -> None:  # type: ignore[no-untyped-def]
    game = CoupleGame(
        space_id=premium["space"].id,
        game=game_kind,
        status=CoupleGameStatus.OPEN.value,
        started_by=premium["anna"].id,
        waiting_on_id=premium["ben"].id,
        payload=CoupleGamePayload(),
    )
    session.add(game)
    session.flush()
    assert _waiting(client, premium) == []
    assert _waiting(client, premium, "b") == [(game_kind, "TURN")]
    # Ending the game ends what it waited for.
    game.status = CoupleGameStatus.ENDED.value
    game.ended_by = premium["anna"].id
    game.waiting_on_id = None
    session.flush()
    assert _waiting(client, premium, "b") == []


def test_picture_ping_pong_waits_on_the_drawer(client, session, premium) -> None:  # type: ignore[no-untyped-def]
    picture = picture_ping_pong.start(session, premium["ctx_b"])
    assert _waiting(client, premium) == []
    assert _waiting(client, premium, "b") == [("PICTURE_PING_PONG", "DRAW")]
    picture.status = PictureStatus.FINISHED.value
    picture.drawer_id = None
    session.flush()
    assert _waiting(client, premium, "b") == []


def test_heart_hunt_waits_on_the_seeker_of_a_hidden_round(client, session, premium) -> None:  # type: ignore[no-untyped-def]
    heart = HeartHuntRound(
        space_id=premium["space"].id,
        hider_id=premium["anna"].id,
        seeker_id=premium["ben"].id,
        request_id=uuid4(),
        heart_x=123,
        heart_y=456,
        created_at=now(),
        purge_after=now() + timedelta(days=7),
    )
    session.add(heart)
    session.flush()
    assert _waiting(client, premium) == []
    response = client.get(
        f"/api/v1/spaces/{premium['space'].id}/games/waiting", headers=auth(premium["b"])
    )
    assert [item["game"] for item in response.json()["items"]] == ["HEART_HUNT"]
    # Never where the heart is, nor the photo.
    assert "123" not in response.text and "456" not in response.text
    heart.state = HeartRoundState.FOUND.value
    heart.found_at = now()
    session.flush()
    assert _waiting(client, premium, "b") == []


def test_garden_waits_for_todays_seed_and_an_open_bouquet(client, session, premium) -> None:  # type: ignore[no-untyped-def]
    sent = client.post(
        f"/api/v1/spaces/{premium['space'].id}/games/garden/seeds",
        headers=auth(premium["a"]),
        json={"species": "POPPY", "words": None},
    )
    assert sent.status_code in (200, 201), sent.text
    assert _waiting(client, premium) == []
    response = client.get(
        f"/api/v1/spaces/{premium['space'].id}/games/waiting", headers=auth(premium["b"])
    )
    assert [item["game"] for item in response.json()["items"]] == ["GARDEN_SEED"]
    assert "POPPY" not in response.text
    seed = session.query(GardenPlant).one()
    planted = client.post(
        f"/api/v1/spaces/{premium['space'].id}/games/garden/seeds/{seed.id}/plant",
        headers=auth(premium["b"]),
    )
    assert planted.status_code == 200, planted.text
    assert _waiting(client, premium, "b") == []

    bouquet = GardenBouquet(
        space_id=premium["space"].id,
        giver_id=premium["ben"].id,
        receiver_id=premium["anna"].id,
        given_on=clock.now().date(),
        flowers=["POPPY"],
        flower_senders=[premium["ben"].id],
    )
    session.add(bouquet)
    session.flush()
    assert _waiting(client, premium) == [("GARDEN_BOUQUET", "OPEN_BOUQUET")]
    assert _waiting(client, premium, "b") == []
    bouquet.closed_at = now()
    session.flush()
    assert _waiting(client, premium) == []


def test_a_seed_from_an_earlier_day_no_longer_waits(client, session, premium) -> None:  # type: ignore[no-untyped-def]
    session.add(
        GardenPlant(
            space_id=premium["space"].id,
            sender_id=premium["anna"].id,
            receiver_id=premium["ben"].id,
            species="POPPY",
            sent_on=clock.now().date() - timedelta(days=2),
        )
    )
    session.flush()
    # It is planted automatically when the garden opens; nothing to do.
    assert _waiting(client, premium, "b") == []


def test_several_waiting_games_come_newest_first(client, session, premium) -> None:  # type: ignore[no-untyped-def]
    earlier = now() - timedelta(hours=3)
    session.add(
        HeartHuntRound(
            space_id=premium["space"].id,
            hider_id=premium["anna"].id,
            seeker_id=premium["ben"].id,
            request_id=uuid4(),
            heart_x=1,
            heart_y=1,
            created_at=earlier,
            purge_after=now() + timedelta(days=7),
        )
    )
    picture_ping_pong.start(session, premium["ctx_b"])
    assert _waiting(client, premium, "b") == [
        ("PICTURE_PING_PONG", "DRAW"),
        ("HEART_HUNT", "SEEK"),
    ]
