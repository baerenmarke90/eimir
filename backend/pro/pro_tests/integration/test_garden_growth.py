"""HTTP/PostgreSQL acceptance tests for the garden's growth and life (#1907 H3, PR 3)."""

# The shared fixtures come from the core garden tests and are re-bound per test.
# ruff: noqa: F811

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from eimir_pro.garden.models import Garden, GardenBouquet, GardenPlant, GardenReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.engagement.models import Notification, NotificationKind
from eimir.relationship import service as relationship_service
from pro_tests.integration.test_garden import (  # noqa: F401 (fixtures)
    DAY_ONE,
    _at,
    _h,
    _project,
    _send,
    _url,
    couple,
    premium,
)
from tests.conftest import auth, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _history(session: Session, couple, days: int, *, stage: int = 3) -> list[GardenPlant]:  # type: ignore[no-untyped-def]
    """Earlier shared days: both partners sent a seed that is now planted."""
    plants: list[GardenPlant] = []
    for k in range(days):
        sent_on = DAY_ONE.date() - timedelta(days=days - k)
        for who, other in (("anna", "ben"), ("ben", "anna")):
            plant = GardenPlant(
                space_id=couple["space"].id,
                sender_id=couple[who].id,
                receiver_id=couple[other].id,
                species="POPPY",
                sent_on=sent_on,
                planted_at=DAY_ONE - timedelta(days=days - k),
                slot=len(plants),
                stage=stage,
                bloomed=stage == 3,
            )
            session.add(plant)
            plants.append(plant)
    session.flush()
    return plants


def _send_offered(client, couple, who="a"):  # type: ignore[no-untyped-def]
    """Send the first seed of today's offer (it rotates once the pool grows)."""
    offer = client.get(_url(couple), headers=_h(couple, who)).json()["offer"]
    return _send(client, couple, who, species=offer[0])


def _even_day(start: datetime) -> datetime:
    """A day on which the wrapped surprise is offered (even calendar ordinal)."""
    return start if start.date().toordinal() % 2 == 0 else start + timedelta(days=1)


def _odd_day(start: datetime) -> datetime:
    return start if start.date().toordinal() % 2 == 1 else start + timedelta(days=1)


def _offer_with(client, couple, monkeypatch, species: str, start: datetime) -> datetime:  # type: ignore[no-untyped-def]
    """Move the clock to the first day whose offer holds `species`."""
    for offset in range(12):
        instant = start + timedelta(days=offset)
        _at(monkeypatch, instant)
        if species in client.get(_url(couple), headers=_h(couple)).json()["offer"]:
            return instant
    raise AssertionError(f"{species} was never offered")


@pytest.mark.parametrize(
    ("method", "suffix", "body"),
    [
        ("post", "/news/seen", None),
        ("put", "/name", {"name": "Rosengarten"}),
        ("post", "/bouquets", {"plantIds": ["00000000-0000-0000-0000-000000000001"]}),
        ("post", "/bouquets/00000000-0000-0000-0000-000000000001/close", {"kept": False}),
    ],
)
def test_every_new_seam_requires_the_games_capability(client, couple, method, suffix, body) -> None:  # type: ignore[no-untyped-def]
    response = getattr(client, method)(
        _url(couple, suffix), headers=_h(couple), **({"json": body} if body else {})
    )
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_a_new_garden_is_a_bed_with_nothing_unlocked(client, premium) -> None:  # type: ignore[no-untyped-def]
    body = client.get(_url(premium), headers=_h(premium)).json()
    assert body["sharedDays"] == 0
    assert body["form"] == "BED"
    assert body["unlocks"] == []
    assert body["news"] == []
    assert body["discovered"] == ["POPPY", "BELLFLOWER", "STARFLOWER"]
    assert body["name"] is None
    assert body["bouquet"] is None
    assert body["gaveBouquetToday"] is False


def test_shared_days_unlock_quietly_and_news_shows_once_per_person(
    client, premium, session
) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 10)
    body = client.get(_url(premium), headers=_h(premium)).json()
    assert body["sharedDays"] == 10
    assert body["form"] == "MEADOW"
    assert set(body["unlocks"]) == {"PATH", "POND", "SUNFLOWER", "TULIP", "WATER_LILY"}
    assert body["news"] == body["unlocks"]

    seen = client.post(_url(premium, "/news/seen"), headers=_h(premium)).json()
    assert seen["news"] == []
    assert client.get(_url(premium), headers=_h(premium)).json()["news"] == []
    # The partner still gets their own announcement.
    assert client.get(_url(premium), headers=_h(premium, "b")).json()["news"] == body["unlocks"]


def test_a_day_only_one_partner_took_part_is_not_a_shared_day(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 4)
    assert _send(client, premium).status_code == 200
    assert client.get(_url(premium), headers=_h(premium)).json()["sharedDays"] == 4
    assert _send(client, premium, "b").status_code == 200
    body = client.get(_url(premium), headers=_h(premium)).json()
    assert body["sharedDays"] == 5
    assert body["news"] == ["PATH"]


def test_a_seed_that_is_not_on_offer_is_rejected(client, premium) -> None:  # type: ignore[no-untyped-def]
    for species in ("SUNFLOWER", "WATER_LILY", "MOONFLOWER", "SURPRISE"):
        response = _send(client, premium, species=species)
        assert response.status_code == 422
        assert response.json()["code"] == "GARDEN_SEED_NOT_OFFERED"


def test_surprise_seed_stays_wrapped_until_it_blooms(client, premium, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 10)
    day = _even_day(DAY_ONE)
    _at(monkeypatch, day)
    offer = client.get(_url(premium), headers=_h(premium)).json()["offer"]
    assert offer[-1] == "SURPRISE"
    sent = _send(client, premium, species="SURPRISE").json()
    assert sent["sentToday"]["species"] == "SURPRISE"
    incoming = client.get(_url(premium), headers=_h(premium, "b")).json()["incoming"]
    assert incoming["species"] == "SURPRISE"
    stored = session.scalar(select(GardenPlant).where(GardenPlant.id == incoming["id"]))
    assert stored is not None and stored.species == "MOONFLOWER"
    assert "MOONFLOWER" not in client.get(_url(premium), headers=_h(premium)).json()["discovered"]

    stored.stage = 2
    stored.planted_at = day
    stored.slot = 99
    session.flush()
    assert _send_offered(client, premium, "b").status_code == 200
    _project(session)
    body = client.get(_url(premium), headers=_h(premium)).json()
    moon = next(plant for plant in body["plants"] if plant["id"] == incoming["id"])
    assert moon["stage"] == 3
    assert moon["species"] == "MOONFLOWER"
    assert "MOONFLOWER" in body["discovered"]


def test_water_lily_goes_into_the_pond(client, premium, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 10, stage=1)
    _offer_with(client, premium, monkeypatch, "WATER_LILY", DAY_ONE)
    assert _send(client, premium, species="WATER_LILY").status_code == 200
    seed = client.get(_url(premium), headers=_h(premium, "b")).json()["incoming"]
    body = client.post(_url(premium, f"/seeds/{seed['id']}/plant"), headers=_h(premium, "b")).json()
    lily = next(plant for plant in body["plants"] if plant["id"] == seed["id"])
    assert lily["inPond"] is True
    assert lily["slot"] == 0
    land = [plant for plant in body["plants"] if not plant["inPond"]]
    assert {plant["slot"] for plant in land} == set(range(20))


def test_a_full_pond_offers_no_more_water_lilies(client, premium, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 12)
    for k in range(6):
        session.add(
            GardenPlant(
                space_id=premium["space"].id,
                sender_id=premium["anna"].id,
                receiver_id=premium["ben"].id,
                species="WATER_LILY",
                sent_on=date(2025, 1, 1) + timedelta(days=k),
                planted_at=DAY_ONE - timedelta(days=40),
                slot=k,
                in_pond=True,
                stage=3,
            )
        )
    session.flush()
    for offset in range(8):
        _at(monkeypatch, DAY_ONE + timedelta(days=offset))
        assert "WATER_LILY" not in client.get(_url(premium), headers=_h(premium)).json()["offer"]


def test_tulip_rests_until_spring(client, premium, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 10)
    tulip = GardenPlant(
        space_id=premium["space"].id,
        sender_id=premium["anna"].id,
        receiver_id=premium["ben"].id,
        species="TULIP",
        sent_on=date(2025, 1, 1),
        planted_at=DAY_ONE - timedelta(days=30),
        slot=50,
        stage=1,
    )
    poppy = GardenPlant(
        space_id=premium["space"].id,
        sender_id=premium["ben"].id,
        receiver_id=premium["anna"].id,
        species="POPPY",
        sent_on=date(2025, 1, 2),
        planted_at=DAY_ONE - timedelta(days=30),
        slot=51,
        stage=1,
    )
    session.add_all([tulip, poppy])
    session.flush()
    assert _send_offered(client, premium).status_code == 200
    assert _send_offered(client, premium, "b").status_code == 200
    session.refresh(tulip)
    session.refresh(poppy)
    assert (tulip.stage, poppy.stage) == (1, 2)

    _at(monkeypatch, datetime(2027, 4, 12, 10, 0, tzinfo=UTC))
    assert _send_offered(client, premium).status_code == 200
    assert _send_offered(client, premium, "b").status_code == 200
    session.refresh(tulip)
    assert tulip.stage == 2


def test_bouquet_travels_to_the_partner_and_seeds_stay(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 3)
    picked = [str(plants[0].id), str(plants[1].id)]
    given = client.post(_url(premium, "/bouquets"), headers=_h(premium), json={"plantIds": picked})
    assert given.status_code == 200
    body = given.json()
    assert body["gaveBouquetToday"] is True
    for plant in body["plants"]:
        if plant["id"] in picked:
            assert plant["stage"] == 0
            assert plant["species"] == "POPPY"
    # The giver has no bouquet card; the partner does.
    assert body["bouquet"] is None
    received = client.get(_url(premium), headers=_h(premium, "b")).json()["bouquet"]
    assert received["giverId"] == str(premium["anna"].id)
    assert [flower["species"] for flower in received["flowers"]] == ["POPPY", "POPPY"]
    assert {flower["senderId"] for flower in received["flowers"]} == {
        str(premium["anna"].id),
        str(premium["ben"].id),
    }

    _project(session)
    notice = session.scalar(
        select(Notification).where(Notification.recipient_account_id == premium["ben"].id)
    )
    assert notice is not None
    assert notice.kind == NotificationKind.GARDEN_SEED_ARRIVED.value
    assert notice.target_type == "GARDEN_BOUQUET"

    closed = client.post(
        _url(premium, f"/bouquets/{received['id']}/close"),
        headers=_h(premium, "b"),
        json={"kept": True},
    )
    assert closed.status_code == 200
    assert closed.json()["bouquet"] is None
    stored = session.scalar(select(GardenBouquet).where(GardenBouquet.id == received["id"]))
    assert stored is not None and stored.kept is True and stored.closed_at is not None


def test_bouquet_negative_cases(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 3)
    budding = _history_plant(session, premium, stage=2, slot=40)
    url = _url(premium, "/bouquets")

    response = client.post(url, headers=_h(premium), json={"plantIds": [str(budding.id)]})
    assert response.status_code == 409
    assert response.json()["code"] == "GARDEN_PLANT_NOT_BLOOMING"

    four = [str(plant.id) for plant in plants[:4]]
    assert client.post(url, headers=_h(premium), json={"plantIds": four}).status_code == 422
    assert client.post(url, headers=_h(premium), json={"plantIds": []}).status_code == 422
    twice = [str(plants[0].id), str(plants[0].id)]
    response = client.post(url, headers=_h(premium), json={"plantIds": twice})
    assert response.status_code == 422

    foreign = "00000000-0000-0000-0000-00000000abcd"
    response = client.post(url, headers=_h(premium), json={"plantIds": [foreign]})
    assert response.status_code == 404

    assert (
        client.post(url, headers=_h(premium), json={"plantIds": [str(plants[0].id)]}).status_code
        == 200
    )
    response = client.post(url, headers=_h(premium), json={"plantIds": [str(plants[2].id)]})
    assert response.status_code == 409
    assert response.json()["code"] == "GARDEN_BOUQUET_ALREADY_GIVEN"

    bouquet = client.get(_url(premium), headers=_h(premium, "b")).json()["bouquet"]
    # Only the receiver can close it; strangers and the giver get not-found.
    close = _url(premium, f"/bouquets/{bouquet['id']}/close")
    assert client.post(close, headers=_h(premium), json={}).status_code == 404
    assert client.post(close, headers=auth(premium["token_outsider"]), json={}).status_code in {
        403,
        404,
    }
    assert (
        client.post(
            _url(premium, "/bouquets/nope/close"), headers=_h(premium, "b"), json={}
        ).status_code
        == 404
    )


def _history_plant(session: Session, couple, *, stage: int, slot: int) -> GardenPlant:  # type: ignore[no-untyped-def]
    plant = GardenPlant(
        space_id=couple["space"].id,
        sender_id=couple["ben"].id,
        receiver_id=couple["anna"].id,
        species="BELLFLOWER",
        sent_on=date(2025, 6, 1) + timedelta(days=slot),
        planted_at=DAY_ONE - timedelta(days=60),
        slot=slot,
        stage=stage,
    )
    session.add(plant)
    session.flush()
    return plant


def test_a_tulip_outside_spring_cannot_be_picked(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    tulip = _history_plant(session, premium, stage=3, slot=12)
    tulip.species = "TULIP"
    session.flush()
    response = client.post(
        _url(premium, "/bouquets"), headers=_h(premium), json={"plantIds": [str(tulip.id)]}
    )
    assert response.status_code == 409


def test_at_most_one_garden_notice_per_person_and_day(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 3)
    assert _send(client, premium).status_code == 200
    client.post(
        _url(premium, "/bouquets"), headers=_h(premium), json={"plantIds": [str(plants[0].id)]}
    )
    _project(session)
    notices = list(
        session.scalars(
            select(Notification).where(
                Notification.recipient_account_id == premium["ben"].id,
                Notification.kind == NotificationKind.GARDEN_SEED_ARRIVED.value,
            )
        )
    )
    assert [notice.target_type for notice in notices] == ["GARDEN_SEED"]


def test_the_garden_can_be_named_by_either_partner(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    named = client.put(
        _url(premium, "/name"), headers=_h(premium), json={"name": "  Unser   Eck  "}
    )
    assert named.status_code == 200
    assert named.json()["name"] == "Unser Eck"
    assert client.get(_url(premium), headers=_h(premium, "b")).json()["name"] == "Unser Eck"

    too_long = client.put(_url(premium, "/name"), headers=_h(premium, "b"), json={"name": "x" * 41})
    assert too_long.status_code == 422
    assert too_long.json()["code"] == "GARDEN_NAME_TOO_LONG"
    extra = client.put(
        _url(premium, "/name"), headers=_h(premium), json={"name": "Eck", "colour": "red"}
    )
    assert extra.status_code == 422

    reset = client.put(_url(premium, "/name"), headers=_h(premium, "b"), json={"name": " "})
    assert reset.json()["name"] is None
    assert session.get(Garden, premium["space"].id) is None


def test_growth_data_leaves_with_the_couple(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 10)
    client.put(_url(premium, "/name"), headers=_h(premium), json={"name": "Eck"})
    client.post(_url(premium, "/news/seen"), headers=_h(premium))
    client.post(
        _url(premium, "/bouquets"), headers=_h(premium), json={"plantIds": [str(plants[0].id)]}
    )
    membership = next(
        member
        for member in relationship_service.active_memberships(session, premium["space"].id)
        if member.account_id == premium["ben"].id
    )
    relationship_service.end_membership(session, membership)
    session.flush()
    space_id = premium["space"].id
    for model in (GardenPlant, GardenBouquet, GardenReader):
        assert session.scalar(select(model).where(model.space_id == space_id)) is None
    assert session.get(Garden, space_id) is None


def test_odd_days_offer_no_surprise(client, premium, session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 10)
    _at(monkeypatch, _odd_day(DAY_ONE))
    assert "SURPRISE" not in client.get(_url(premium), headers=_h(premium)).json()["offer"]
