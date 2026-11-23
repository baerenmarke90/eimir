"""Pure growth rules of the shared garden (#1907 H3, concept A, PR 3)."""

from datetime import date, timedelta

from eimir_pro.garden import growth
from eimir_pro.garden.models import GardenForm, GardenSpecies, GardenUnlock

AUTUMN = date(2026, 11, 16)
SPRING = date(2027, 4, 10)


def test_unlocks_follow_the_approved_thresholds_and_never_reset() -> None:
    assert growth.unlocked(0) == []
    assert growth.unlocked(4) == []
    assert growth.unlocked(5) == [GardenUnlock.PATH]
    assert set(growth.unlocked(10)) == {
        GardenUnlock.PATH,
        GardenUnlock.POND,
        GardenUnlock.SUNFLOWER,
        GardenUnlock.TULIP,
        GardenUnlock.WATER_LILY,
    }
    assert GardenUnlock.BENCH in growth.unlocked(18)
    assert {GardenUnlock.TREE, GardenUnlock.MORE_ROOM, GardenUnlock.STRAWBERRY} <= set(
        growth.unlocked(25)
    )
    assert GardenUnlock.BIRDHOUSE in growth.unlocked(35)
    assert set(growth.unlocked(50)) == set(GardenUnlock)
    assert set(growth.unlocked(400)) == set(GardenUnlock)


def test_news_names_only_what_was_reached_since_the_last_look() -> None:
    assert growth.reached_between(0, 0) == []
    assert growth.reached_between(4, 5) == [GardenUnlock.PATH]
    assert growth.reached_between(5, 9) == []
    assert growth.reached_between(17, 25) == [
        GardenUnlock.BENCH,
        GardenUnlock.TREE,
        GardenUnlock.MORE_ROOM,
        GardenUnlock.STRAWBERRY,
    ]


def test_forms_from_bed_to_paradise() -> None:
    assert growth.form(0) is GardenForm.BED
    assert growth.form(9) is GardenForm.BED
    assert growth.form(10) is GardenForm.MEADOW
    assert growth.form(25) is GardenForm.GARDEN
    assert growth.form(50) is GardenForm.PARADISE


def test_offer_is_three_seeds_from_the_unlocked_pool() -> None:
    for offset in range(6):
        day = AUTUMN + timedelta(days=offset)
        offer = growth.offer(day, 0, pond_has_room=True)
        assert sorted(offer) == sorted(growth.BASE_SPECIES)
        assert growth.offer(day, 0, pond_has_room=True) == offer
    seen: set[GardenSpecies] = set()
    for offset in range(12):
        offer = growth.offer(AUTUMN + timedelta(days=offset), 30, pond_has_room=True)
        assert len(offer) == growth.OFFER_SIZE
        assert len(set(offer)) == growth.OFFER_SIZE
        seen |= set(offer)
    assert {GardenSpecies.SUNFLOWER, GardenSpecies.STRAWBERRY, GardenSpecies.SURPRISE} <= seen
    assert GardenSpecies.MOONFLOWER not in seen


def test_surprise_is_offered_every_other_day_once_the_garden_is_a_meadow() -> None:
    days = [AUTUMN + timedelta(days=offset) for offset in range(4)]
    early = [GardenSpecies.SURPRISE in growth.offer(day, 9, pond_has_room=True) for day in days]
    later = [GardenSpecies.SURPRISE in growth.offer(day, 10, pond_has_room=True) for day in days]
    assert not any(early)
    assert later.count(True) == 2


def test_a_full_pond_takes_the_water_lily_off_the_offer() -> None:
    for offset in range(10):
        day = AUTUMN + timedelta(days=offset)
        assert GardenSpecies.WATER_LILY not in growth.offer(day, 12, pond_has_room=False)


def test_tulip_rests_until_spring_and_only_blooms_then() -> None:
    assert growth.can_grow("TULIP", 0, AUTUMN)
    assert not growth.can_grow("TULIP", 1, AUTUMN)
    assert growth.can_grow("TULIP", 1, SPRING)
    assert growth.can_grow("POPPY", 2, AUTUMN)
    assert not growth.can_grow("POPPY", 3, SPRING)
    assert growth.is_blooming("POPPY", 3, AUTUMN)
    assert not growth.is_blooming("POPPY", 2, AUTUMN)
    assert not growth.is_blooming("TULIP", 3, AUTUMN)
    assert growth.is_blooming("TULIP", 3, SPRING)


def test_moonflower_stays_wrapped_until_it_first_blooms() -> None:
    assert growth.shown_species("MOONFLOWER", False) is GardenSpecies.SURPRISE
    assert growth.shown_species("MOONFLOWER", True) is GardenSpecies.MOONFLOWER
    assert growth.shown_species("POPPY", False) is GardenSpecies.POPPY


def test_garden_book_starts_with_the_first_three_and_keeps_what_bloomed() -> None:
    assert growth.discovered([]) == list(growth.BASE_SPECIES)
    book = growth.discovered(["MOONFLOWER", "POPPY", "WATER_LILY"])
    assert book == [
        GardenSpecies.POPPY,
        GardenSpecies.BELLFLOWER,
        GardenSpecies.STARFLOWER,
        GardenSpecies.WATER_LILY,
        GardenSpecies.MOONFLOWER,
    ]
    assert GardenSpecies.SURPRISE not in growth.discovered(["MOONFLOWER"])
