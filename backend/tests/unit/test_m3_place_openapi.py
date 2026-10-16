"""Verify the Place slice reflects the contract decided in M3-D06 through M3-D08.

Two guarantees exist only in the shape of the contract: coordinates may exist
only as a pair, and M3 does not promise map functionality such as geocoding,
provider data, or radius search.
"""

from __future__ import annotations

from eimir.main import create_app

COLLECTION = "/api/v1/spaces/{spaceId}/places"
DETAIL = "/api/v1/spaces/{spaceId}/places/{placeId}"


def _schema() -> dict[str, object]:
    return create_app().openapi()


def _paths() -> dict[str, dict[str, dict]]:
    return _schema()["paths"]  # type: ignore[index,return-value]


def _components() -> dict[str, dict]:
    return _schema()["components"]["schemas"]  # type: ignore[index,return-value]


def test_place_routes_have_frozen_operation_ids() -> None:
    paths = _paths()
    assert paths[COLLECTION]["post"]["operationId"] == "createPlace"
    assert paths[COLLECTION]["get"]["operationId"] == "listPlaces"
    assert paths[DETAIL]["get"]["operationId"] == "getPlace"
    assert paths[DETAIL]["patch"]["operationId"] == "updatePlace"
    assert paths[DETAIL]["delete"]["operationId"] == "deletePlace"


RELATION_SLUGS = ("memories", "heart-moments", "milestones")

RELATION_PATHS = {
    f"{DETAIL}/{slug}{suffix}" for slug in RELATION_SLUGS for suffix in ("", "/{targetId}")
}


def test_the_place_surface_is_crud_plus_typed_relations() -> None:
    """The surface is closed and completely enumerated.

    M3-S4 adds the typed relations from M3-D08 and only those relations. This
    assertion deliberately remains an equality instead of a subset check so a
    route that was not consciously added here is caught before generated
    clients expose it.

    `places/{placeId}/plans` and `places/{placeId}/chapters` are intentionally
    absent. `Plan.placeId` is the canonical single-valued association and
    `Chapter.placeId` will be the equivalent in S5. There is no second source of
    truth for the same association (M3-D08/D31).
    """
    assert {path for path in _paths() if "/places" in path} == {
        COLLECTION,
        DETAIL,
        *RELATION_PATHS,
    }


def test_mutations_require_if_match() -> None:
    detail = _paths()[DETAIL]
    for method in ("patch", "delete"):
        parameters = {p["name"]: p for p in detail[method].get("parameters", [])}
        assert "If-Match" in parameters
        assert parameters["If-Match"]["required"] is True


def test_no_request_body_accepts_server_owned_fields() -> None:
    forbidden = {
        "createdBy",
        "spaceId",
        "version",
        "id",
        "createdAt",
        "updatedAt",
        "privacyClass",
    }
    for name in ("PlaceCreate", "PlaceUpdate"):
        schema = _components()[name]
        assert set(schema["properties"]) & forbidden == set(), name
        assert schema.get("additionalProperties") is False, name


def test_create_needs_only_a_name() -> None:
    """A Place without coordinates is fully valid (M3-D06)."""
    schema = _components()["PlaceCreate"]
    assert set(schema["properties"]) == {
        "name",
        "description",
        "address",
        "latitude",
        "longitude",
    }
    assert schema["required"] == ["name"]


def test_coordinates_are_numbers_and_nullable_in_the_patch() -> None:
    """This allows a Place to be reset to name-only data."""
    update = _components()["PlaceUpdate"]["properties"]
    for field in ("latitude", "longitude"):
        types = {option.get("type") for option in update[field].get("anyOf", [])}
        assert "number" in types, field
        assert "null" in types, field


def test_detail_exposes_the_stored_coordinates() -> None:
    schema = _components()["PlaceDetail"]
    assert {"name", "description", "address", "latitude", "longitude", "createdBy"} <= set(
        schema["properties"]
    )


def test_the_contract_promises_no_map_feature() -> None:
    """M3 provides domain behavior and stored Place data, not map features.

    There is no geocoding, provider ID, radius search, or distance sorting. All
    of those would introduce a provider concern requiring a separate reuse
    review and belong to M7/M8.
    """
    place_schemas = {
        name: schema for name, schema in _components().items() if name.startswith("Place")
    }
    forbidden = {
        "provider",
        "providerId",
        "placeId_external",
        "mapUrl",
        "geocoded",
        "formattedAddress",
        "distance",
        "radius",
    }
    for name, schema in place_schemas.items():
        assert set(schema.get("properties", {})) & forbidden == set(), name

    parameters = {p["name"] for p in _paths()[COLLECTION]["get"].get("parameters", [])}
    assert parameters == {"spaceId", "cursor", "limit"}


def test_the_plan_contract_now_carries_the_place() -> None:
    """Carry forward the M3-S2 decision (M3-D08/D31).

    `placeId` is single-valued and canonical; there is no parallel
    `place_plans` surface.
    """
    for name in ("PlanCreate", "WishToPlan"):
        assert "placeId" in _components()[name]["properties"], name

    update = _components()["PlanUpdate"]["properties"]["placeId"]
    types = {option.get("type") for option in update.get("anyOf", [])}
    assert "null" in types

    assert "placeId" in _components()["PlanDetail"]["properties"]
    assert not any("/plans/{planId}/places" in path for path in _paths())
