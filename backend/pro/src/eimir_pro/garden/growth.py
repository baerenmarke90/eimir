"""Pure growth rules of the shared garden (#1907 H3, concept A, PR 3).

The garden grows with the couple's cumulative shared days: days on which both
partners sent a seed. The count is derived from the seeds, never reset, and
gaps cost nothing. Quiet unlocks follow fixed thresholds from the approved
prototype; nothing here is ever shown as a number or a progress bar.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date
from types import MappingProxyType

from eimir_pro.garden.models import GardenForm, GardenSpecies, GardenUnlock

# Product Owner approved prototype thresholds (2026-11-16), in shared days.
UNLOCK_DAYS: MappingProxyType[GardenUnlock, int] = MappingProxyType(
    {
        GardenUnlock.PATH: 5,
        GardenUnlock.POND: 10,
        GardenUnlock.SUNFLOWER: 10,
        GardenUnlock.TULIP: 10,
        GardenUnlock.WATER_LILY: 10,
        GardenUnlock.BENCH: 18,
        GardenUnlock.TREE: 25,
        GardenUnlock.MORE_ROOM: 25,
        GardenUnlock.STRAWBERRY: 25,
        GardenUnlock.BIRDHOUSE: 35,
        GardenUnlock.ROSE_ARCH: 50,
        GardenUnlock.SWING: 50,
        GardenUnlock.STREAM: 50,
        GardenUnlock.EVEN_MORE_ROOM: 50,
    }
)
FORM_DAYS: tuple[tuple[int, GardenForm], ...] = (
    (50, GardenForm.PARADISE),
    (25, GardenForm.GARDEN),
    (10, GardenForm.MEADOW),
    (0, GardenForm.BED),
)
BASE_SPECIES = (GardenSpecies.POPPY, GardenSpecies.BELLFLOWER, GardenSpecies.STARFLOWER)
# Species that join the seed pool with the unlock of the same name.
UNLOCKED_SPECIES = (
    GardenSpecies.SUNFLOWER,
    GardenSpecies.TULIP,
    GardenSpecies.WATER_LILY,
    GardenSpecies.STRAWBERRY,
)
# The wrapped surprise seed is offered every other day from this many shared days.
SURPRISE_DAYS = 10
POND_CAPACITY = 6
OFFER_SIZE = 3
SPRING_MONTHS = frozenset({3, 4, 5})
MAX_BOUQUET = 3


def unlocked(shared_days: int) -> list[GardenUnlock]:
    """Unlocks reached so far, in a stable order."""
    return [unlock for unlock, days in UNLOCK_DAYS.items() if shared_days >= days]


def reached_between(before: int, now: int) -> list[GardenUnlock]:
    """Unlocks reached after `before` shared days, up to `now`; announced once."""
    return [unlock for unlock, days in UNLOCK_DAYS.items() if before < days <= now]


def form(shared_days: int) -> GardenForm:
    return next(value for days, value in FORM_DAYS if shared_days >= days)


def pool(shared_days: int) -> list[GardenSpecies]:
    """Species that may be offered: the base three plus the unlocked ones."""
    reached = set(unlocked(shared_days))
    return [*BASE_SPECIES, *(s for s in UNLOCKED_SPECIES if GardenUnlock(s.value) in reached)]


def offer(today: date, shared_days: int, *, pond_has_room: bool) -> tuple[GardenSpecies, ...]:
    """Three seeds of the day, rotating through the pool by calendar day.

    The rotation is deterministic, so both devices and a reload show the same
    choice. A water lily is left out while the pond has no free place.
    """
    available = [
        species
        for species in pool(shared_days)
        if species is not GardenSpecies.WATER_LILY or pond_has_room
    ]
    ordinal = today.toordinal()
    start = (ordinal * 2) % len(available)
    picks: list[GardenSpecies] = []
    for step in range(len(available)):
        species = available[(start + step) % len(available)]
        if species not in picks:
            picks.append(species)
        if len(picks) == OFFER_SIZE:
            break
    # Shown in the pool's order, so the first garden always reads the same way.
    picks.sort(key=available.index)
    if shared_days >= SURPRISE_DAYS and ordinal % 2 == 0:
        picks[-1] = GardenSpecies.SURPRISE
    return tuple(picks)


def is_spring(day: date) -> bool:
    """Seasons follow the calendar month until the shared season helper exists."""
    return day.month in SPRING_MONTHS


def can_grow(species: str, stage: int, today: date) -> bool:
    """A tulip bulb sprouts, then rests until spring before it buds and blooms."""
    if stage >= 3:
        return False
    return not (species == GardenSpecies.TULIP.value and stage >= 1 and not is_spring(today))


def is_blooming(species: str, stage: int, today: date) -> bool:
    """A flower shown in bloom today; a tulip blooms only in spring."""
    if stage < 3:
        return False
    return species != GardenSpecies.TULIP.value or is_spring(today)


def shown_species(species: str, bloomed: bool) -> GardenSpecies:
    """A moonflower stays a wrapped surprise until it first blooms."""
    if species == GardenSpecies.MOONFLOWER.value and not bloomed:
        return GardenSpecies.SURPRISE
    return GardenSpecies(species)


def discovered(bloomed_species: Iterable[str]) -> list[GardenSpecies]:
    """The garden book: the base three plus every species that ever bloomed."""
    seen = {*BASE_SPECIES, *(GardenSpecies(species) for species in bloomed_species)}
    return [species for species in GardenSpecies if species in seen]
