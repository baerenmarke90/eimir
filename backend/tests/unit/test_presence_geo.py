"""Precision and banding rules from docs/m9/PARTNER-LOCATION.md."""

from __future__ import annotations

from decimal import Decimal

import pytest

from eimir.presence import geo
from eimir.presence.geo import DistanceBand, DistanceBandKind


@pytest.mark.parametrize(
    ("value", "expected"),
    [(53.5511, Decimal("53.55")), (9.9937, Decimal("9.99")), (-0.005, Decimal("-0.00"))],
)
def test_coordinates_snap_to_the_hundredth_degree_grid(value: float, expected: Decimal) -> None:
    assert geo.snap_coordinate(value) == expected


@pytest.mark.parametrize(
    ("reported", "stored"),
    [(0, 1000), (12.5, 1000), (999, 1000), (1001, 1100), (2450, 2500)],
)
def test_stored_accuracy_is_coarse_and_rounded_up(reported: float, stored: int) -> None:
    assert geo.stored_accuracy(reported) == stored


def test_map_radius_never_falls_below_the_disclosed_area() -> None:
    assert geo.map_radius(1000) == 1500
    assert geo.map_radius(4000) == 4000


def test_haversine_matches_a_known_city_pair() -> None:
    # Hamburg to Cologne is roughly 357 km great-circle.
    assert geo.haversine_km(53.55, 9.99, 50.94, 6.96) == pytest.approx(357, abs=3)


@pytest.mark.parametrize(
    ("kilometres", "band"),
    [
        (0.0, DistanceBand(DistanceBandKind.NEARBY)),
        (1.99, DistanceBand(DistanceBandKind.NEARBY)),
        (2.0, DistanceBand(DistanceBandKind.RANGE, min_km=2, max_km=5)),
        (7.3, DistanceBand(DistanceBandKind.RANGE, min_km=5, max_km=10)),
        (24.9, DistanceBand(DistanceBandKind.RANGE, min_km=10, max_km=25)),
        (49.9, DistanceBand(DistanceBandKind.RANGE, min_km=25, max_km=50)),
        (50.0, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=50)),
        (357.0, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=350)),
        (499.0, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=500)),
        (520.0, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=500)),
        (9100.0, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=9100)),
    ],
)
def test_distance_bands_follow_the_product_decision(kilometres: float, band: DistanceBand) -> None:
    assert geo.distance_band(kilometres) == band
