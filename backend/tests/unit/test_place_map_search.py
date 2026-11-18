"""Provider bounds and normalized results without real external traffic."""

import httpx
import pytest

from eimir.providers.photon import GeocodingUnavailableError
from eimir.providers.place_search import normalize_search_results, search_places


def feature(longitude=8.64, latitude=54.31):  # type: ignore[no-untyped-def]
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [longitude, latitude]},
        "properties": {
            "name": "Beach",
            "city": "Sankt Peter-Ording",
            "street": "Beach Road",
            "housenumber": "1",
        },
    }


def test_search_uses_only_operator_origin_query_locale_and_bounded_limit():
    requests = []

    def respond(request):  # type: ignore[no-untyped-def]
        requests.append(request)
        return httpx.Response(200, json={"features": [feature(), feature()]})

    result = search_places(
        "https://photon.example.test", "Beach", "de-DE", transport=httpx.MockTransport(respond)
    )
    assert len(result) == 1
    assert result[0].name == "Beach"
    assert result[0].address == "Beach Road 1, Sankt Peter-Ording"
    assert dict(requests[0].url.params) == {"q": "Beach", "lang": "de", "limit": "5"}
    assert "authorization" not in requests[0].headers


@pytest.mark.parametrize("coordinates", [(181, 20), (20, 91), (True, 20), (float("nan"), 20)])
def test_rejects_invalid_provider_coordinates(coordinates):  # type: ignore[no-untyped-def]
    assert normalize_search_results({"features": [feature(*coordinates)]}) == []


@pytest.mark.parametrize("status", [301, 403, 429, 500])
def test_availability_errors_never_expose_query_or_provider_url(status):  # type: ignore[no-untyped-def]
    with pytest.raises(GeocodingUnavailableError, match=r"^PLACE_LOOKUP_UNAVAILABLE$"):
        search_places(
            "https://photon.example.test",
            "Private address",
            "de",
            transport=httpx.MockTransport(lambda request: httpx.Response(status)),
        )


def test_disabled_lookup_and_oversized_payload_are_bounded():
    with pytest.raises(GeocodingUnavailableError):
        search_places("", "Beach", "de")
    with pytest.raises(GeocodingUnavailableError):
        search_places(
            "https://photon.example.test",
            "Beach",
            "de",
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, content=b"x" * 32769)
            ),
        )
