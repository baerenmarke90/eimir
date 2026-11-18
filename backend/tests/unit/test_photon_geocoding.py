"""The actual adapter must bound egress and reject misleading location results."""

from __future__ import annotations

from decimal import Decimal

import httpx
import pytest

from eimir.places.models import PlacePayload
from eimir.providers.base import GeoPoint
from eimir.providers.photon import (
    MAX_RESPONSE_BYTES,
    GeocodingUnavailableError,
    PhotonReverseGeocoder,
    normalize_result,
    validate_photon_url,
)

POINT = GeoPoint(Decimal("52.516667"), Decimal("13.400000"))


def result(**properties: object) -> dict[str, object]:
    return {
        "features": [
            {
                "geometry": {"type": "Point", "coordinates": [13.4, 52.516667]},
                "properties": {
                    "name": "Riverside cafe",
                    "street": "River Lane",
                    "housenumber": "12",
                    "postcode": "10100",
                    "city": "Berlin",
                    **properties,
                },
            }
        ]
    }


def test_retains_real_name_address_source_and_original_pin() -> None:
    candidate = normalize_result(result(), POINT)
    assert candidate is not None
    assert candidate.name == "Riverside cafe"
    assert candidate.address == "River Lane 12, 10100 Berlin"
    assert candidate.source == "openstreetmap" and candidate.position == POINT


def test_uses_supplied_locality_without_inventing_street_or_building() -> None:
    candidate = normalize_result(result(name=None, street=None, housenumber=None), POINT)
    assert candidate is not None and candidate.name == "Berlin"
    assert candidate.address == "10100 Berlin"


@pytest.mark.parametrize(
    "coordinates",
    [
        [13.5, 52.6],
        [0, 0],
        [13.4],
        [True, 52.516667],
        [float("nan"), 52.516667],
        [181, 52.516667],
        [13.4, 91],
        None,
    ],
)
def test_rejects_distant_or_invalid_candidate_geometry(coordinates: object) -> None:
    value = {
        "features": [
            {
                "geometry": {"type": "Point", "coordinates": coordinates},
                "properties": {"name": "Incorrect venue"},
            }
        ]
    }
    assert normalize_result(value, POINT) is None


@pytest.mark.parametrize(
    "value", [None, [], {}, {"features": [None]}, result(name={}, city={}, street={})]
)
def test_malformed_or_empty_results_do_not_fabricate_place(value: object) -> None:
    assert normalize_result(value, POINT) is None


def test_actual_http_transport_sends_only_bounded_coordinates_and_language() -> None:
    calls: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json=result())

    adapter = PhotonReverseGeocoder(
        "https://geocoder.example", transport=httpx.MockTransport(respond)
    )
    assert adapter.reverse(POINT, "de-DE") is not None
    assert len(calls) == 1 and calls[0].url.path == "/reverse"
    assert dict(calls[0].url.params) == {
        "lat": "52.516667",
        "lon": "13.400000",
        "lang": "de",
        "limit": "1",
        "radius": "0.2",
    }
    assert not calls[0].content
    assert "authorization" not in calls[0].headers
    assert "cookie" not in calls[0].headers and "referer" not in calls[0].headers
    assert calls[0].headers["accept-encoding"] == "identity"


@pytest.mark.parametrize("status", [429, 500, 503])
def test_retry_errors_never_expose_response_text_or_coordinate_url(status: int) -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(status, text="Private response"))
    with pytest.raises(GeocodingUnavailableError, match=r"^PHOTO_GEOCODING_UNAVAILABLE$") as raised:
        PhotonReverseGeocoder("https://geocoder.example", transport=transport).reverse(POINT, "en")
    assert raised.value.__cause__ is None


def test_timeout_is_a_safe_retry_code() -> None:
    def timeout(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout(str(request.url), request=request)

    with pytest.raises(GeocodingUnavailableError, match=r"^PHOTO_GEOCODING_UNAVAILABLE$"):
        PhotonReverseGeocoder(
            "https://geocoder.example", transport=httpx.MockTransport(timeout)
        ).reverse(
            POINT,
            "en",
        )


def test_redirect_is_not_followed_and_oversized_payload_is_not_consumed() -> None:
    for response in (
        httpx.Response(302, headers={"Location": "http://127.0.0.1/secret"}),
        httpx.Response(200, content=b"x" * (MAX_RESPONSE_BYTES + 1)),
    ):
        calls = []

        def respond(
            request: httpx.Request,
            response: httpx.Response = response,
            calls: list[httpx.Request] = calls,
        ) -> httpx.Response:
            calls.append(request)
            return response

        assert (
            PhotonReverseGeocoder(
                "https://geocoder.example",
                transport=httpx.MockTransport(respond),
            ).reverse(POINT, "en")
            is None
        )
        assert len(calls) == 1


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "https://user:secret@host",
        "https://host/?token=secret",
        "https://host/redirect",
        "https://host/#fragment",
        "https://white space",
    ],
)
def test_operator_url_rejects_credentials_paths_and_unsupported_protocols(url: str) -> None:
    with pytest.raises(ValueError, match=r"^Photo-place geocoder"):
        validate_photon_url(url)


def test_empty_origin_disables_transport_and_old_payloads_remain_valid() -> None:
    assert PhotonReverseGeocoder("").reverse(POINT, "de") is None
    assert PlacePayload.model_validate({"name": "Our place"}).geocoding_source is None
