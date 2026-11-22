"""Warmth words, found radius and coarse meter of the Herzversteck search."""

from __future__ import annotations

import pytest
from eimir_pro.heart_hunt.service import warmth


def test_tap_on_the_heart_is_found_and_hot() -> None:
    assert warmth(500, 500, 500, 500) == (3, 100, True)


@pytest.mark.parametrize(
    ("tap", "level"),
    [((500, 590), 3), ((500, 700), 2), ((500, 850), 1), ((1000, 1000), 0)],
)
def test_levels_follow_distance(tap: tuple[int, int], level: int) -> None:
    got, meter, found = warmth(*tap, 500, 500)
    assert got == level
    assert meter % 5 == 0 and 0 <= meter <= 100
    assert not found or level == 3


def test_vertical_distance_counts_more_because_the_frame_is_four_by_five() -> None:
    horizontal = warmth(580, 500, 500, 500)
    vertical = warmth(500, 580, 500, 500)
    assert vertical[1] <= horizontal[1]


def test_found_radius_is_small() -> None:
    assert warmth(560, 500, 500, 500)[2] is True
    assert warmth(600, 500, 500, 500)[2] is False


def test_meter_is_coarse_so_taps_cannot_be_triangulated_to_a_pixel() -> None:
    meters = {warmth(500 + step, 500, 800, 800)[1] for step in range(0, 20)}
    assert len(meters) <= 3
