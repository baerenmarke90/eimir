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
# The precise choice (PO 2026-11-17): a 0.001 degree grid, about 111 m north-south.
PRECISE_GRID_STEP = Decimal("0.001")
MIN_STORED_ACCURACY_METERS = 1000
# Precise positions are stored no finer than this: the grid cell's half diagonal
# (about 80 m) plus a typical satellite fix error.
MIN_PRECISE_STORED_ACCURACY_METERS = 200
# A fix reported as less accurate than this is not precise, whatever was chosen
# (Android may grant only the approximate permission).
MAX_PRECISE_REPORTED_ACCURACY_METERS = 500
ACCURACY_STEP_METERS = 100
MAX_ACCEPTED_ACCURACY_METERS = 50_000
MIN_MAP_RADIUS_METERS = 1500
NEARBY_LIMIT_KM = 2.0
_RANGE_BOUNDS_KM = (2, 5, 10, 25, 50)
_FINE_ROUNDING_LIMIT_KM = 500
# Below 2 km, two precise positions resolve to these metre bands.
_CLOSE_BOUNDS_METERS = (0, 300, 1000, 2000)


class DistanceBandKind(StrEnum):
    NEARBY = "NEARBY"
    # Only when both positions are precise (finer than NEARBY, below 2 km).
    CLOSE = "CLOSE"
    RANGE = "RANGE"
    APPROXIMATE = "APPROXIMATE"


@dataclass(frozen=True)
class DistanceBand:
    kind: DistanceBandKind
    min_km: int | None = None
    max_km: int | None = None
    approximate_km: int | None = None
    min_meters: int | None = None
    max_meters: int | None = None


def is_precise_fix(reported_meters: float | None) -> bool:
    """Whether a reported accuracy is good enough for the precise grid."""
    return reported_meters is not None and reported_meters <= MAX_PRECISE_REPORTED_ACCURACY_METERS


def is_precise_stored(stored_accuracy_meters: int) -> bool:
    """Stored accuracies below the approximate floor can only come from precise fixes."""
    return stored_accuracy_meters < MIN_STORED_ACCURACY_METERS


def snap_coordinate(value: float, *, precise: bool = False) -> Decimal:
    """Snap one coordinate to the 0.01 degree grid (0.001 for a precise fix)."""
    step = PRECISE_GRID_STEP if precise else GRID_STEP
    return Decimal(str(value)).quantize(step, rounding=ROUND_HALF_EVEN)


def stored_accuracy(reported_meters: float, *, precise: bool = False) -> int:
    """Round up to 100 m; never claim better than 1 km (200 m for a precise fix)."""
    rounded = math.ceil(max(reported_meters, 0) / ACCURACY_STEP_METERS) * ACCURACY_STEP_METERS
    floor = MIN_PRECISE_STORED_ACCURACY_METERS if precise else MIN_STORED_ACCURACY_METERS
    return max(rounded, floor)


def map_radius(stored_accuracy_meters: int) -> int:
    if is_precise_stored(stored_accuracy_meters):
        return stored_accuracy_meters
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


def distance_band(distance_km: float, *, fine: bool = False) -> DistanceBand:
    """Map an exact great-circle distance to its coarse, product-approved band.

    ``fine`` is true only when both positions are precise; the coarser side
    always governs, so one approximate position keeps the whole band coarse.
    """
    if distance_km < NEARBY_LIMIT_KM:
        if not fine:
            return DistanceBand(DistanceBandKind.NEARBY)
        meters = distance_km * 1000
        for lower, upper in pairwise(_CLOSE_BOUNDS_METERS):
            if meters < upper:
                return DistanceBand(DistanceBandKind.CLOSE, min_meters=lower, max_meters=upper)
        return DistanceBand(DistanceBandKind.NEARBY)
    for lower, upper in pairwise(_RANGE_BOUNDS_KM):
        if distance_km < upper:
            return DistanceBand(DistanceBandKind.RANGE, min_km=lower, max_km=upper)
    if distance_km < _FINE_ROUNDING_LIMIT_KM:
        return DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=_round_to(distance_km, 50))
    return DistanceBand(DistanceBandKind.APPROXIMATE, approximate_km=_round_to(distance_km, 100))
