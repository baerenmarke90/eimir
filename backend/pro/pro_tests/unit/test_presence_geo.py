"""Precision and banding rules from docs/m9/PARTNER-LOCATION.md."""

from __future__ import annotations

from decimal import Decimal

import pytest
from eimir_pro.presence import geo
from eimir_pro.presence.geo import DistanceBand, DistanceBandKind


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


def test_position_payload_keeps_the_bounds_the_columns_used_to_check() -> None:
    from eimir_pro.presence.models import PresencePositionPayload
    from pydantic import ValidationError

    stored = PresencePositionPayload(
        latitude=geo.snap_coordinate(53.5512),
        longitude=geo.snap_coordinate(9.9937),
        accuracy_meters=geo.stored_accuracy(12),
    )
    # The snapped decimals survive the JSON form the payload is sealed as.
    assert PresencePositionPayload.unseal(stored.seal()) == stored
    assert (stored.latitude, stored.longitude) == (Decimal("53.55"), Decimal("9.99"))

    for invalid in (
        {"latitude": Decimal("90.01"), "longitude": Decimal("0"), "accuracy_meters": 1000},
        {"latitude": Decimal("0"), "longitude": Decimal("-180.01"), "accuracy_meters": 1000},
        {"latitude": Decimal("0"), "longitude": Decimal("0"), "accuracy_meters": 199},
    ):
        with pytest.raises(ValidationError):
            PresencePositionPayload(**invalid)


def test_precise_coordinates_snap_to_the_thousandth_degree_grid() -> None:
    assert geo.snap_coordinate(53.55117, precise=True) == Decimal("53.551")
    assert geo.snap_coordinate(9.99371, precise=True) == Decimal("9.994")
    # The approximate grid is unchanged.
    assert geo.snap_coordinate(53.55117) == Decimal("53.55")


@pytest.mark.parametrize(
    ("reported", "stored"), [(0, 200), (12, 200), (201, 300), (480, 500), (500, 500)]
)
def test_precise_stored_accuracy_never_claims_better_than_the_grid(
    reported: float, stored: int
) -> None:
    assert geo.stored_accuracy(reported, precise=True) == stored
    assert geo.is_precise_stored(stored)


def test_a_fix_counts_as_precise_only_when_it_reports_a_good_accuracy() -> None:
    assert geo.is_precise_fix(35)
    assert geo.is_precise_fix(500)
    assert not geo.is_precise_fix(501)
    assert not geo.is_precise_fix(None)
    assert not geo.is_precise_stored(1000)


def test_map_radius_follows_a_precise_accuracy_down_to_the_grid() -> None:
    assert geo.map_radius(200) == 200
    assert geo.map_radius(500) == 500
    assert geo.map_radius(1000) == 1500


@pytest.mark.parametrize(
    ("kilometres", "band"),
    [
        (0.0, DistanceBand(DistanceBandKind.CLOSE, min_meters=0, max_meters=300)),
        (0.299, DistanceBand(DistanceBandKind.CLOSE, min_meters=0, max_meters=300)),
        (0.3, DistanceBand(DistanceBandKind.CLOSE, min_meters=300, max_meters=1000)),
        (0.999, DistanceBand(DistanceBandKind.CLOSE, min_meters=300, max_meters=1000)),
        (1.0, DistanceBand(DistanceBandKind.CLOSE, min_meters=1000, max_meters=2000)),
        (1.999, DistanceBand(DistanceBandKind.CLOSE, min_meters=1000, max_meters=2000)),
        (2.0, DistanceBand(DistanceBandKind.RANGE, min_km=2, max_km=5)),
        (130, DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=150)),
    ],
)
def test_fine_bands_only_refine_below_two_kilometres(kilometres: float, band: DistanceBand) -> None:
    assert geo.distance_band(kilometres, fine=True) == band


def test_without_fine_the_nearby_band_never_gets_finer() -> None:
    assert geo.distance_band(0.1) == DistanceBand(DistanceBandKind.NEARBY)
    assert geo.distance_band(1.9) == DistanceBand(DistanceBandKind.NEARBY)
