"""HTTP/PostgreSQL acceptance tests for the garden's history (#2158 G)."""

# The shared fixtures come from the core garden tests and are re-bound per test.
# ruff: noqa: F811

from __future__ import annotations

from datetime import timedelta

import pytest
from eimir_pro.garden.models import GardenPlant
from sqlalchemy import select
from sqlalchemy.orm import Session

from pro_tests.integration.test_garden import (  # noqa: F401 (fixtures)
    DAY_ONE,
    _at,
    _h,
    _send,
    _url,
    couple,
    premium,
)
from pro_tests.integration.test_garden_growth import _even_day, _history, _send_offered
from tests.conftest import auth, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _read(client, couple, who="a", **query):  # type: ignore[no-untyped-def]
    response = client.get(_url(couple, "/history"), headers=_h(couple, who), params=query)
    assert response.status_code == 200, response.text
    return response.json()


def _kinds(page) -> list[str]:  # type: ignore[no-untyped-def]
    return [entry["kind"] for entry in page["items"]]


def _plant_incoming(client, couple, who="b"):  # type: ignore[no-untyped-def]
    seed = client.get(_url(couple), headers=_h(couple, who)).json()["incoming"]
    planted = client.post(_url(couple, f"/seeds/{seed['id']}/plant"), headers=_h(couple, who))
    assert planted.status_code == 200
    return seed


def test_history_requires_the_games_capability(client, couple) -> None:  # type: ignore[no-untyped-def]
    response = client.get(_url(couple, "/history"), headers=_h(couple))
    assert response.status_code == 403
    assert response.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"


def test_an_outsider_reads_nothing(client, premium) -> None:  # type: ignore[no-untyped-def]
    assert _send(client, premium, words="MISS_YOU").status_code == 200
    response = client.get(_url(premium, "/history"), headers=auth(premium["token_outsider"]))
    assert response.status_code in {403, 404}
    assert "POPPY" not in response.text and "MISS_YOU" not in response.text


def test_an_empty_garden_has_no_history(client, premium) -> None:  # type: ignore[no-untyped-def]
    page = _read(client, premium)
    assert page == {"items": [], "nextCursor": None, "hasMore": False}


def test_a_day_reads_newest_first_and_a_waiting_seed_keeps_its_words(  # type: ignore[no-untyped-def]
    client, premium, monkeypatch
) -> None:
    anna, ben = str(premium["anna"].id), str(premium["ben"].id)
    assert _send(client, premium, words="MISS_YOU").status_code == 200

    # The receiver sees the seed but not its folded words until it is planted.
    waiting = _read(client, premium, "b")["items"]
    assert [(entry["kind"], entry["waiting"]) for entry in waiting] == [("SEED_SENT", True)]
    assert waiting[0]["species"] == "POPPY"
    assert waiting[0]["words"] is None
    assert waiting[0]["actorId"] == anna
    # The sender sees their own words.
    own = _read(client, premium)["items"]
    assert own[0]["words"] == "MISS_YOU" and own[0]["waiting"] is False

    seed = _plant_incoming(client, premium)
    assert _send(client, premium, "b", species="BELLFLOWER").status_code == 200
    for who in ("a", "b"):
        watered = client.post(
            _url(premium, "/waterings"), headers=_h(premium, who), json={"plantId": seed["id"]}
        )
        assert watered.status_code == 200

    page = _read(client, premium, "b")
    assert _kinds(page) == [
        "WATERED_TOGETHER",
        "SHARED_DAY",
        "SEED_PLANTED",
        "SEED_SENT",
        "SEED_SENT",
    ]
    assert {entry["happenedOn"] for entry in page["items"]} == {"2026-11-16"}
    planted = page["items"][2]
    assert planted["actorId"] == ben and planted["senderId"] == anna
    assert planted["words"] == "MISS_YOU"
    # Ben's own seed was sent after Anna's, so it reads first.
    sent = page["items"][3:]
    assert [entry["actorId"] for entry in sent] == [ben, anna]
    assert sent[1]["words"] == "MISS_YOU" and sent[1]["waiting"] is False
    assert page["items"][0]["actorId"] is None

    # Nobody planted Ben's seed; on a later day it found its place by itself.
    _at(monkeypatch, DAY_ONE + timedelta(days=2))
    later = _read(client, premium)
    first = later["items"][0]
    assert first["kind"] == "SEED_PLANTED"
    assert first["happenedOn"] == "2026-11-18"
    assert first["actorId"] is None and first["senderId"] == ben


def test_one_partner_watering_names_the_plant(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 1, stage=1)
    watered = client.post(
        _url(premium, "/waterings"), headers=_h(premium), json={"plantId": str(plants[1].id)}
    )
    assert watered.status_code == 200
    entry = _read(client, premium)["items"][0]
    assert entry["kind"] == "WATERED"
    assert entry["actorId"] == str(premium["anna"].id)
    assert entry["senderId"] == str(premium["ben"].id)
    assert entry["species"] == "POPPY"


def test_a_surprise_stays_wrapped_until_its_first_bloom(  # type: ignore[no-untyped-def]
    client, premium, session: Session, monkeypatch
) -> None:
    _history(session, premium, 10)
    day = _even_day(DAY_ONE)
    _at(monkeypatch, day)
    assert _send(client, premium, species="SURPRISE").status_code == 200
    for who in ("a", "b"):
        entries = _read(client, premium, who)["items"]
        assert entries[0]["species"] == "SURPRISE"
        assert "MOONFLOWER" not in str(entries)

    stored = session.scalar(select(GardenPlant).where(GardenPlant.species == "MOONFLOWER"))
    assert stored is not None
    stored.stage = 2
    stored.planted_at = day
    stored.slot = 99
    session.flush()
    assert _send_offered(client, premium, "b").status_code == 200

    page = _read(client, premium, "b", limit=10)
    bloom = next(entry for entry in page["items"] if entry["kind"] == "FIRST_BLOOM")
    assert bloom["species"] == "MOONFLOWER"
    assert bloom["happenedOn"] == day.date().isoformat()
    assert bloom["senderId"] == str(premium["anna"].id)
    assert bloom["actorId"] is None
    sent = next(
        entry
        for entry in page["items"]
        if entry["kind"] == "SEED_SENT" and entry["actorId"] == str(premium["anna"].id)
    )
    assert sent["species"] == "MOONFLOWER"
    # The test planted the moonflower by hand today.
    assert _kinds(page)[:3] == ["FIRST_BLOOM", "SHARED_DAY", "SEED_PLANTED"]


def test_blooms_from_before_the_history_keep_no_day(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 2)
    kinds = _kinds(_read(client, premium, limit=50))
    assert "FIRST_BLOOM" not in kinds
    assert kinds.count("SHARED_DAY") == 2


def test_a_bouquet_is_given_and_kept(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    plants = _history(session, premium, 2)
    picked = [str(plants[0].id), str(plants[3].id)]
    given = client.post(_url(premium, "/bouquets"), headers=_h(premium), json={"plantIds": picked})
    assert given.status_code == 200
    bouquet = client.get(_url(premium), headers=_h(premium, "b")).json()["bouquet"]
    closed = client.post(
        _url(premium, f"/bouquets/{bouquet['id']}/close"),
        headers=_h(premium, "b"),
        json={"kept": True},
    )
    assert closed.status_code == 200

    entries = _read(client, premium)["items"]
    assert [entry["kind"] for entry in entries[:2]] == ["BOUQUET_KEPT", "BOUQUET_GIVEN"]
    kept, gift = entries[0], entries[1]
    assert kept["actorId"] == str(premium["ben"].id)
    assert gift["actorId"] == str(premium["anna"].id)
    assert [flower["species"] for flower in gift["flowers"]] == ["POPPY", "POPPY"]
    assert {flower["senderId"] for flower in gift["flowers"]} == {
        str(premium["anna"].id),
        str(premium["ben"].id),
    }
    assert kept["happenedOn"] == gift["happenedOn"] == "2026-11-16"


def test_pages_walk_the_whole_history_without_gaps(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 4)
    whole = _read(client, premium, limit=50)
    assert whole["hasMore"] is False
    keys = [entry["key"] for entry in whole["items"]]
    assert len(keys) == len(set(keys)) == 4 * 2 * 2 + 4

    walked: list[str] = []
    cursor = None
    while True:
        page = _read(client, premium, limit=3, **({"cursor": cursor} if cursor else {}))
        walked.extend(entry["key"] for entry in page["items"])
        if not page["hasMore"]:
            assert page["nextCursor"] is None
            break
        cursor = page["nextCursor"]
    assert walked == keys
    days = [entry["happenedOn"] for entry in whole["items"]]
    assert days == sorted(days, reverse=True)


def test_a_cursor_continues_only_the_readers_own_history(client, premium, session) -> None:  # type: ignore[no-untyped-def]
    _history(session, premium, 2)
    cursor = _read(client, premium, limit=2)["nextCursor"]
    assert cursor
    foreign = client.get(
        _url(premium, "/history"), headers=_h(premium, "b"), params={"cursor": cursor}
    )
    assert foreign.status_code == 400
    assert foreign.json()["code"] == "INVALID_CURSOR"
    tampered = client.get(
        _url(premium, "/history"), headers=_h(premium), params={"cursor": cursor[:-2] + "xx"}
    )
    assert tampered.status_code == 400
