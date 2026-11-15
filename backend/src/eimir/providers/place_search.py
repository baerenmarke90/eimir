"""Bounded, operator-configured Photon forward lookup for explicit map selection."""

import json
import math
import time
from decimal import Decimal

import httpx

from eimir.providers.base import GeoPoint, PlaceCandidate
from eimir.providers.photon import (
    MAX_RESPONSE_BYTES,
    GeocodingUnavailableError,
    normalize_result,
    validate_photon_url,
)


def normalize_search_results(data: object) -> list[PlaceCandidate]:
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        return []
    results: list[PlaceCandidate] = []
    seen: set[tuple[str, str, str]] = set()
    for feature in data["features"][:5]:
        if not isinstance(feature, dict) or not isinstance(feature.get("geometry"), dict):
            continue
        coordinates = feature["geometry"].get("coordinates")
        if not isinstance(coordinates, list) or len(coordinates) != 2:
            continue
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            for value in coordinates
        ):
            continue
        longitude, latitude = coordinates
        if abs(latitude) > 90 or abs(longitude) > 180:
            continue
        point = GeoPoint(latitude=Decimal(str(latitude)), longitude=Decimal(str(longitude)))
        candidate = normalize_result({"features": [feature]}, point)
        if candidate is None:
            continue
        identity = (candidate.name, str(point.latitude), str(point.longitude))
        if identity not in seen:
            seen.add(identity)
            results.append(candidate)
    return results


def search_places(
    origin: str,
    query: str,
    language: str,
    *,
    transport: httpx.BaseTransport | None = None,
) -> list[PlaceCandidate]:
    origin = validate_photon_url(origin)
    if not origin:
        raise GeocodingUnavailableError("PLACE_LOOKUP_UNAVAILABLE")
    locale = language.split("-")[0].lower()
    if not (locale.isascii() and locale.isalpha() and 2 <= len(locale) <= 3):
        locale = "en"
    try:
        with (
            httpx.Client(
                timeout=httpx.Timeout(4.0, connect=2.0),
                follow_redirects=False,
                trust_env=False,
                transport=transport,
                headers={
                    "User-Agent": "eimir-place-picker/1.0 (+https://github.com/baerenmarke90/eimir)",
                    "Accept": "application/json",
                    "Accept-Encoding": "identity",
                },
            ) as client,
            client.stream(
                "GET",
                f"{origin}/api/",
                params={
                    "q": query,
                    "lang": locale,
                    "limit": "5",
                },
            ) as response,
        ):
            if (
                response.status_code != 200
                or response.headers.get("Content-Encoding", "identity").lower() != "identity"
            ):
                raise GeocodingUnavailableError("PLACE_LOOKUP_UNAVAILABLE")
            chunks = bytearray()
            deadline = time.monotonic() + 4.0
            for chunk in response.iter_bytes():
                chunks.extend(chunk)
                if len(chunks) > MAX_RESPONSE_BYTES or time.monotonic() > deadline:
                    raise GeocodingUnavailableError("PLACE_LOOKUP_UNAVAILABLE")
            return normalize_search_results(json.loads(chunks))
    except (httpx.HTTPError, ValueError, RecursionError):
        raise GeocodingUnavailableError("PLACE_LOOKUP_UNAVAILABLE") from None
