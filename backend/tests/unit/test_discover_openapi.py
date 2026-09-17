"""Public contract guard for the finite Discover read model."""

from __future__ import annotations

from eimir.main import create_app


def test_discover_contract_is_finite_and_minimal() -> None:
    schema = create_app().openapi()
    operation = schema["paths"]["/api/v1/spaces/{spaceId}/discover"]["get"]
    response = operation["responses"]["200"]["content"]["application/json"]["schema"]
    selection = schema["components"]["schemas"]["DiscoverSelection"]

    assert operation["operationId"] == "getStoryDiscover"
    assert response == {"$ref": "#/components/schemas/DiscoverSelection"}
    assert set(selection["properties"]) == {
        "selectionDate",
        "lead",
        "items",
        "leadContext",
    }
    assert selection["properties"]["lead"]["anyOf"][0] == {"$ref": "#/components/schemas/StoryItem"}
    assert selection["properties"]["items"]["items"] == {"$ref": "#/components/schemas/StoryItem"}


def test_discover_contract_exposes_no_ranking_or_pagination_metadata() -> None:
    schema = create_app().openapi()
    serialized = str(schema["components"]["schemas"]["DiscoverSelection"]).lower()

    for forbidden in (
        "algorithm",
        "affinity",
        "reason",
        "score",
        "ranking",
        "cursor",
        "hasmore",
        "availableyears",
    ):
        assert forbidden not in serialized
