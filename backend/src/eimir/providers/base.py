"""Interfaces for external providers.

Domain code knows no concrete provider. External data is normalized before it
enters the domain; otherwise eimir. objects eventually carry the quirks of
foreign APIs and changing providers becomes a domain rewrite.

None of these interfaces is implemented in M0. They exist so later
integrations have a predefined boundary.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum


@dataclass(frozen=True)
class GeoPoint:
    latitude: Decimal
    longitude: Decimal


@dataclass(frozen=True)
class PlaceCandidate:
    """A place candidate from an external source."""

    external_id: str
    name: str
    address: str | None
    position: GeoPoint | None
    source: str


@dataclass(frozen=True)
class DiscoveryItem:
    """A normalized external event or leisure suggestion."""

    external_id: str
    title: str
    category: str
    description: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    position: GeoPoint | None = None
    location_name: str | None = None
    source: str = ""
    source_url: str | None = None
    image_url: str | None = None


@dataclass(frozen=True)
class MapRoute:
    """A provider-neutral route whose geometry and metrics use SI units."""

    geometry: tuple[GeoPoint, ...]
    distance_meters: int
    duration_seconds: int


@dataclass(frozen=True)
class RecipeIngredient:
    name: str
    amount: Decimal | None = None
    unit: str | None = None


@dataclass(frozen=True)
class RecipeItem:
    """Normalized recipe data without a concrete catalog DTO."""

    external_id: str
    title: str
    ingredients: tuple[RecipeIngredient, ...]
    instructions: tuple[str, ...]
    source: str
    description: str | None = None
    total_minutes: int | None = None
    source_url: str | None = None
    image_url: str | None = None


class EntertainmentKind(StrEnum):
    MOVIE = "MOVIE"
    SERIES = "SERIES"
    BOOK = "BOOK"
    GAME = "GAME"
    MUSIC = "MUSIC"
    OTHER = "OTHER"


@dataclass(frozen=True)
class EntertainmentItem:
    """A normalized media result independent of a shop or streaming service."""

    external_id: str
    title: str
    kind: EntertainmentKind
    source: str
    release_year: int | None = None
    description: str | None = None
    source_url: str | None = None
    image_url: str | None = None


@dataclass(frozen=True)
class ExternalMediaItem:
    """A photo or video in an external service.

    Deliberately a reference rather than a copy. Whether a later integration
    references or imports the item is an explicit decision.
    """

    external_id: str
    captured_at: datetime | None
    position: GeoPoint | None
    thumbnail_url: str | None
    source: str


class SharingMode(StrEnum):
    """An external connection is not shared with a partner automatically."""

    PRIVATE = "PRIVATE"
    SPACE_SHARED = "SPACE_SHARED"


class MapProvider(ABC):
    @abstractmethod
    def route(
        self,
        origin: GeoPoint,
        destination: GeoPoint,
        via: tuple[GeoPoint, ...] = (),
    ) -> MapRoute: ...


class GeocodingProvider(ABC):
    @abstractmethod
    def search(self, query: str, limit: int = 10) -> list[PlaceCandidate]: ...

    @abstractmethod
    def reverse(self, position: GeoPoint) -> PlaceCandidate | None: ...


class PlacesProvider(ABC):
    @abstractmethod
    def search(
        self,
        query: str,
        near: GeoPoint | None = None,
        radius_km: int | None = None,
        limit: int = 10,
    ) -> list[PlaceCandidate]: ...

    @abstractmethod
    def get(self, external_id: str) -> PlaceCandidate | None: ...


class DiscoveryProvider(ABC):
    @abstractmethod
    def find(
        self, position: GeoPoint, radius_km: int, on: date | None = None
    ) -> list[DiscoveryItem]: ...


class RecipeProvider(ABC):
    @abstractmethod
    def search(self, query: str, limit: int = 20) -> list[RecipeItem]: ...

    @abstractmethod
    def get(self, external_id: str) -> RecipeItem | None: ...


class EntertainmentProvider(ABC):
    @abstractmethod
    def search(
        self,
        query: str,
        kinds: tuple[EntertainmentKind, ...] = (),
        limit: int = 20,
    ) -> list[EntertainmentItem]: ...


class ExternalMediaProvider(ABC):
    @abstractmethod
    def find_by_date(self, on: date) -> list[ExternalMediaItem]: ...

    @abstractmethod
    def find_near(self, position: GeoPoint, radius_km: int) -> list[ExternalMediaItem]: ...


class LocationHistoryProvider(ABC):
    @abstractmethod
    def places_visited(self, on: date) -> list[PlaceCandidate]: ...
