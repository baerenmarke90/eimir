"""Bounded reverse lookup behind the existing normalized provider vocabulary."""

from __future__ import annotations

import json
import math
import time
from decimal import Decimal
from typing import Any
from urllib.parse import urlsplit

import httpx

from eimir.providers.base import GeoPoint, PlaceCandidate

MAX_RESPONSE_BYTES = 32_768
MAX_DISTANCE_METERS = 200


class GeocodingUnavailableError(Exception):
    """Only a stable code may escape the transport; URLs contain locations."""


def validate_photon_url(value: str) -> str:
    if not value:
        return value
    url = urlsplit(value)
    if (
        url.scheme not in {"http", "https"}
        or not url.hostname
        or url.username is not None
        or url.password is not None
        or url.query
        or url.fragment
        or url.path not in {"", "/"}
        or any(character.isspace() for character in value)
    ):
        raise ValueError("Photo-place geocoder must be an HTTP(S) origin without credentials.")
    return value.rstrip("/")


def _text(properties: dict[str, Any], key: str) -> str:
    value = properties.get(key)
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:256]


def _distance(position: GeoPoint, coordinates: object) -> float:
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return math.inf
    if any(isinstance(value, bool) or not isinstance(value, (float, int)) for value in coordinates):
        return math.inf
    longitude, latitude = coordinates
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        return math.inf
    if abs(latitude) > 90 or abs(longitude) > 180:
        return math.inf
    lat_a, lat_b = math.radians(float(position.latitude)), math.radians(latitude)
    delta_lon = math.radians(longitude - float(position.longitude))
    haversine = math.sin((lat_b - lat_a) / 2) ** 2
    haversine += math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lon / 2) ** 2
    return 6_371_000 * 2 * math.asin(math.sqrt(min(1.0, max(0.0, haversine))))


def normalize_result(data: object, position: GeoPoint) -> PlaceCandidate | None:
    """Reject distant guesses; retain only supplied, readable address parts."""
    if not isinstance(data, dict) or not isinstance(data.get("features"), list):
        return None
    for feature in data["features"][:3]:
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        properties = feature.get("properties")
        if not isinstance(geometry, dict) or geometry.get("type") != "Point":
            continue
        if not isinstance(properties, dict):
            continue
        if _distance(position, geometry.get("coordinates")) > MAX_DISTANCE_METERS:
            continue
        street = _text(properties, "street")
        locality = next(
            (
                value
                for key in ("city", "town", "village", "district", "county")
                if (value := _text(properties, key))
            ),
            "",
        )
        street_line = " ".join(filter(None, (street, _text(properties, "housenumber"))))
        if not street:
            street_line = ""
        locality_line = " ".join(filter(None, (_text(properties, "postcode"), locality)))
        address = ", ".join(dict.fromkeys(filter(None, (street_line, locality_line))))
        name = _text(properties, "name") or locality or street
        if not name:
            continue
        return PlaceCandidate(
            external_id="",
            name=name,
            address=address or None,
            position=position,
            source="openstreetmap",
        )
    return None


class PhotonReverseGeocoder:
    """Reverse-only Photon adapter; no SDK, forward search or client proxy."""

    def __init__(self, origin: str, *, transport: httpx.BaseTransport | None = None) -> None:
        self.origin = validate_photon_url(origin)
        self.transport = transport

    def reverse(self, position: GeoPoint, language: str) -> PlaceCandidate | None:
        if not self.origin:
            return None
        if (
            not position.latitude.is_finite()
            or not position.longitude.is_finite()
            or abs(position.latitude) > Decimal(90)
            or abs(position.longitude) > Decimal(180)
        ):
            return None
        locale = language.split("-")[0].lower()
        if not (locale.isascii() and locale.isalpha() and 2 <= len(locale) <= 3):
            locale = "en"
        try:
            with (
                httpx.Client(
                    timeout=httpx.Timeout(4.0, connect=2.0),
                    follow_redirects=False,
                    trust_env=False,
                    transport=self.transport,
                    headers={
                        "User-Agent": "eimir-photo-places/1.0 (+https://github.com/baerenmarke90/eimir)",
                        "Accept": "application/json",
                        "Accept-Encoding": "identity",
                    },
                ) as client,
                client.stream(
                    "GET",
                    f"{self.origin}/reverse",
                    params={
                        "lat": str(position.latitude),
                        "lon": str(position.longitude),
                        "lang": locale,
                        "limit": "1",
                        "radius": "0.2",
                    },
                ) as response,
            ):
                if response.status_code == 429 or response.status_code >= 500:
                    raise GeocodingUnavailableError("PHOTO_GEOCODING_UNAVAILABLE")
                if response.status_code != 200:
                    return None
                if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                    return None
                chunks = bytearray()
                deadline = time.monotonic() + 4.0
                for chunk in response.iter_bytes():
                    if time.monotonic() > deadline:
                        raise GeocodingUnavailableError("PHOTO_GEOCODING_UNAVAILABLE")
                    chunks.extend(chunk)
                    if len(chunks) > MAX_RESPONSE_BYTES:
                        return None
                return normalize_result(json.loads(chunks), position)
        except (httpx.HTTPError, ValueError, RecursionError):
            raise GeocodingUnavailableError("PHOTO_GEOCODING_UNAVAILABLE") from None
