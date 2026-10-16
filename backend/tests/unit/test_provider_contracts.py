"""Providers remain abstract, normalized, and freely configurable."""

from __future__ import annotations

import inspect
from decimal import Decimal

import pytest

from eimir.providers.base import (
    DiscoveryProvider,
    EntertainmentProvider,
    ExternalMediaProvider,
    GeocodingProvider,
    GeoPoint,
    LocationHistoryProvider,
    MapProvider,
    MapRoute,
    PlacesProvider,
    RecipeProvider,
)
from eimir.providers.registry import ProviderRegistry


class StraightLineMap(MapProvider):
    def route(
        self,
        origin: GeoPoint,
        destination: GeoPoint,
        via: tuple[GeoPoint, ...] = (),
    ) -> MapRoute:
        return MapRoute(
            geometry=(origin, *via, destination),
            distance_meters=1,
            duration_seconds=1,
        )


def test_all_required_providers_are_abstract_contracts() -> None:
    interfaces = (
        MapProvider,
        GeocodingProvider,
        PlacesProvider,
        DiscoveryProvider,
        RecipeProvider,
        EntertainmentProvider,
        ExternalMediaProvider,
        LocationHistoryProvider,
    )
    assert all(inspect.isabstract(interface) for interface in interfaces)


def test_registry_selects_adapter_only_by_configured_name() -> None:
    registry = ProviderRegistry()
    adapter = StraightLineMap()
    registry.register(MapProvider, "self-hosted", adapter)

    assert registry.select(MapProvider, " SELF-HOSTED ") is adapter


def test_registry_rejects_wrong_adapter_type() -> None:
    registry = ProviderRegistry()
    with pytest.raises(TypeError, match="MapProvider"):
        registry.register(MapProvider, "wrong", object())  # type: ignore[arg-type]


def test_map_contract_returns_normalized_internal_model() -> None:
    start = GeoPoint(Decimal("52.52"), Decimal("13.405"))
    destination = GeoPoint(Decimal("52.51"), Decimal("13.39"))
    route = StraightLineMap().route(start, destination)

    assert isinstance(route, MapRoute)
    assert route.geometry == (start, destination)
    assert type(route).__module__ == "eimir.providers.base"
