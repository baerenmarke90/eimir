"""HTTP/PostgreSQL acceptance tests for the shared garden (#1907 H3, concept A)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.core.clock import now
from eimir.engagement import notification_policy
from eimir.engagement import service as engagement
from eimir.engagement.models import Notification, NotificationKind
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.garden.models import GardenPlant
from eimir.outbox.models import OutboxEvent
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

DAY_ONE = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    outsider = make_account(session, "Outsider")
    space = make_space(session, anna)
    relationship_service.add_member(session, space.id, ben)
    make_space(session, outsider)
    session.flush()
    return {
        "anna": anna,
        "ben": ben,
        "space": space,
        "token_a": sign_in(session, anna),
        "token_b": sign_in(session, ben),
        "token_outsider": sign_in(session, outsider),
    }


@pytest.fixture
def premium(session: Session, couple, monkeypatch):  # type: ignore[no-untyped-def]
    entitlement_service.record_grant(
        session,
        space_id=couple["space"].id,
        account_id=couple["anna"].id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now() - timedelta(days=1),
        capabilities=[Capability.GAMES_COUPLE.value],
    )
    session.flush()
    _at(monkeypatch, DAY_ONE)
    return couple


def _at(monkeypatch, instant: datetime) -> None:  # type: ignore[no-untyped-def]
    monkeypatch.setattr(clock, "now", lambda: instant)


def _url(couple, suffix: str = "") -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{couple['space'].id}/games/garden{suffix}"


def _h(couple, who: str = "a"):  # type: ignore[no-untyped-def]
    return auth(couple["token_a" if who == "a" else "token_b"])


def _send(client, couple, who="a", species="POPPY", words=None):  # type: ignore[no-untyped-def]
    body = {"species": species} | ({"words": words} if words else {})
    return client.post(_url(couple, "/seeds"), headers=_h(couple, who), json=body)


def _project(session: Session) -> None:
    for event in session.scalars(
        select(OutboxEvent).order_by(OutboxEvent.created_at, OutboxEvent.id)
    ):
        engagement.project_event(session, event)
    session.flush()


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("get", "", None),
        ("post", "/seeds", {"species": "POPPY"}),
        ("post", "/seeds/00000000-0000-0000-0000-000000000001/plant", None),
        ("post", "/waterings", {"plantId": "00000000-0000-0000-0000-000000000001"}),
    ],
)
def test_every_seam_requires_the_games_capability(client, couple, method, suffix, body) -> None:  # type: ignore[no-untyped-def]
    response = getattr(client, method)(
        _url(couple, suffix), headers=_h(couple), **({"json": body} if body else {})
    )
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_outsider_cannot_read_the_garden(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _send(client, premium).status_code == 200
    response = client.get(_url(premium), headers=auth(premium["token_outsider"]))
    assert response.status_code in {403, 404}
    assert "POPPY" not in response.text


def test_empty_garden_offers_three_seeds(client, premium) -> None:  # type: ignore[no-untyped-def]
    body = client.get(_url(premium), headers=_h(premium)).json()
    assert body["plants"] == []
    assert body["incoming"] is None
    assert body["sentToday"] is None
    assert body["offer"] == ["POPPY", "BELLFLOWER", "STARFLOWER"]
    assert body["localDate"] == "2026-11-16"


def test_seed_travels_to_the_partner_who_plants_it(client, premium) -> None:  # type: ignore[no-untyped-def]
    sent = _send(client, premium, words="MISS_YOU").json()
    assert sent["sentToday"]["species"] == "POPPY"
    assert sent["sentToday"]["words"] == "MISS_YOU"
    assert sent["incoming"] is None
    received = client.get(_url(premium), headers=_h(premium, "b")).json()
    seed = received["incoming"]
    assert seed["senderId"] == str(premium["anna"].id)
    assert seed["words"] == "MISS_YOU"
    assert seed["slot"] is None
    # Only the receiver plants; the sender gets a privacy-safe 404.
    assert (
        client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium)).status_code
        == 404
    )
    planted = client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium, "b"))
    assert planted.status_code == 200
    body = planted.json()
    assert body["incoming"] is None
    assert [(plant["species"], plant["stage"], plant["slot"]) for plant in body["plants"]] == [
        ("POPPY", 0, 0)
    ]
    again = client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium, "b"))
    assert again.status_code == 409
    assert again.json()["code"] == "GARDEN_SEED_ALREADY_PLANTED"


def test_one_seed_per_partner_and_day(client, premium, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    assert _send(client, premium).status_code == 200
    second = _send(client, premium, species="BELLFLOWER")
    assert second.status_code == 409
    assert second.json()["code"] == "GARDEN_SEED_ALREADY_SENT"
    _at(monkeypatch, DAY_ONE + timedelta(days=1))
    assert _send(client, premium, species="BELLFLOWER").status_code == 200


def test_unknown_species_or_words_are_rejected(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _send(client, premium, species="ROSE").status_code == 422
    assert _send(client, premium, words="Ich liebe dich").status_code == 422


def test_garden_grows_once_on_a_day_both_took_part(client, premium, monkeypatch, session) -> None:  # type: ignore[no-untyped-def]
    # Day one: Anna sends, Ben plants and sends back; Anna plants.
    _send(client, premium)
    incoming_b = client.get(_url(premium), headers=_h(premium, "b")).json()["incoming"]
    client.post(_url(premium, f"/seeds/{incoming_b['id']}/plant"), headers=_h(premium, "b"))
    shared = _send(client, premium, who="b", species="STARFLOWER").json()
    assert shared["sharedToday"] is True
    # The planted poppy grew one stage when the second seed of the day was sent.
    assert [plant["stage"] for plant in shared["plants"]] == [1]
    incoming_a = client.get(_url(premium), headers=_h(premium)).json()["incoming"]
    after = client.post(_url(premium, f"/seeds/{incoming_a['id']}/plant"), headers=_h(premium))
    assert sorted(plant["stage"] for plant in after.json()["plants"]) == [0, 1]
    # A day with only one partner changes nothing.
    _at(monkeypatch, DAY_ONE + timedelta(days=1))
    lonely = _send(client, premium).json()
    assert lonely["sharedToday"] is False
    assert sorted(plant["stage"] for plant in lonely["plants"]) == [0, 1]
    # Stages never exceed bloom.
    for plant in session.scalars(select(GardenPlant).where(GardenPlant.planted_at.is_not(None))):
        plant.stage = 3
    session.flush()
    _at(monkeypatch, DAY_ONE + timedelta(days=2))
    _send(client, premium)
    final = _send(client, premium, who="b").json()
    assert all(plant["stage"] <= 3 for plant in final["plants"])


def test_a_seed_nobody_planted_is_planted_the_next_day(client, premium, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _send(client, premium, species="BELLFLOWER")
    _at(monkeypatch, DAY_ONE + timedelta(days=3))
    body = client.get(_url(premium), headers=_h(premium, "b")).json()
    assert body["incoming"] is None
    assert [(plant["species"], plant["stage"]) for plant in body["plants"]] == [("BELLFLOWER", 0)]


def test_watering_is_one_daily_gesture_without_growth(client, premium, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _send(client, premium)
    seed = client.get(_url(premium), headers=_h(premium, "b")).json()["incoming"]
    client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium, "b"))
    watered = client.post(
        _url(premium, "/waterings"), headers=_h(premium), json={"plantId": seed["id"]}
    )
    assert watered.status_code == 200
    assert watered.json()["wateredToday"] == seed["id"]
    assert watered.json()["plants"][0]["stage"] == 0
    partner_view = client.get(_url(premium), headers=_h(premium, "b")).json()
    assert partner_view["partnerWateredToday"] == seed["id"]
    twice = client.post(
        _url(premium, "/waterings"), headers=_h(premium), json={"plantId": seed["id"]}
    )
    assert twice.status_code == 409
    assert twice.json()["code"] == "GARDEN_ALREADY_WATERED"
    _at(monkeypatch, DAY_ONE + timedelta(days=1))
    assert (
        client.post(
            _url(premium, "/waterings"), headers=_h(premium), json={"plantId": seed["id"]}
        ).status_code
        == 200
    )


def test_seed_notice_is_neutral_and_goes_stale_once_planted(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _send(client, premium, words="MISS_YOU")
    _project(session)
    notice = session.scalar(
        select(Notification).where(
            Notification.kind == NotificationKind.GARDEN_SEED_ARRIVED.value,
            Notification.recipient_account_id == premium["ben"].id,
        )
    )
    assert notice is not None
    policy = notification_policy.for_kind(NotificationKind.GARDEN_SEED_ARRIVED.value)
    assert policy is not None
    assert policy.preview == notification_policy.GENERIC_PREVIEW
    listed = client.get(
        f"/api/v1/spaces/{premium['space'].id}/notifications", headers=_h(premium, "b")
    )
    assert listed.status_code == 200
    assert "GARDEN_SEED_ARRIVED" in listed.text
    assert "MISS_YOU" not in listed.text
    seed = client.get(_url(premium), headers=_h(premium, "b")).json()["incoming"]
    client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium, "b"))
    stale = client.get(
        f"/api/v1/spaces/{premium['space'].id}/notifications", headers=_h(premium, "b")
    )
    assert "GARDEN_SEED_ARRIVED" not in stale.text


def test_the_garden_leaves_with_the_couple(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _send(client, premium)
    membership = next(
        member
        for member in relationship_service.active_memberships(session, premium["space"].id)
        if member.account_id == premium["ben"].id
    )
    relationship_service.end_membership(session, membership)
    session.flush()
    assert session.scalars(select(GardenPlant)).first() is None
