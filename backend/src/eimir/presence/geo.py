"""Pure precision and distance rules for partner location (docs/m9/PARTNER-LOCATION.md).

Nothing in this module touches storage or logging; it receives coordinates and
returns reduced-precision values only.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal
from enum import StrEnum
from itertools import pairwise

EARTH_RADIUS_KM = 6371.0088
GRID_STEP = Decimal("0.01")
MIN_STORED_ACCURACY_METERS = 1000
ACCURACY_STEP_METERS = 100
MAX_ACCEPTED_ACCURACY_METERS = 50_000
MIN_MAP_RADIUS_METERS = 1500
NEARBY_LIMIT_KM = 2.0
_RANGE_BOUNDS_KM = (2, 5, 10, 25, 50)
_FINE_ROUNDING_LIMIT_KM = 500


class DistanceBandKind(StrEnum):
    NEARBY = "NEARBY"
    RANGE = "RANGE"
    APPROXIMATE = "APPROXIMATE"


@dataclass(frozen=True)
class DistanceBand:
    kind: DistanceBandKind
    min_km: int | None = None
    max_km: int | None = None
    approximate_km: int | None = None


def snap_coordinate(value: float) -> Decimal:
    """Snap one coordinate to the 0.01 degree grid."""
    return Decimal(str(value)).quantize(GRID_STEP, rounding=ROUND_HALF_EVEN)


def stored_accuracy(reported_meters: float) -> int:
    """Round up to 100 m and never claim better than 1 km."""
    rounded = math.ceil(max(reported_meters, 0) / ACCURACY_STEP_METERS) * ACCURACY_STEP_METERS
    return max(rounded, MIN_STORED_ACCURACY_METERS)


def map_radius(stored_accuracy_meters: int) -> int:
    return max(stored_accuracy_meters, MIN_MAP_RADIUS_METERS)


def haversine_km(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    phi_a = math.radians(lat_a)
    phi_b = math.radians(lat_b)
    d_phi = math.radians(lat_b - lat_a)
    d_lambda = math.radians(lon_b - lon_a)
    h = math.sin(d_phi / 2) ** 2 + math.cos(phi_a) * math.cos(phi_b) * math.sin(d_lambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(h)))


def _round_to(value_km: float, step: int) -> int:
    return max(step, int(Decimal(value_km / step).quantize(Decimal(1), ROUND_HALF_EVEN)) * step)


def distance_band(distance_km: float) -> DistanceBand:
    """Map an exact great-circle distance to its coarse, product-approved band."""
    if distance_km < NEARBY_LIMIT_KM:
        return DistanceBand(DistanceBandKind.NEARBY)
    for lower, upper in pairwise(_RANGE_BOUNDS_KM):
        if distance_km < upper:
            return DistanceBand(DistanceBandKind.RANGE, min_km=lower, max_km=upper)
    if distance_km < _FINE_ROUNDING_LIMIT_KM:
        return DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=_round_to(distance_km, 50))
    return DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=_round_to(distance_km, 100))
