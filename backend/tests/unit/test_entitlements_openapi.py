"""Unit tests for the OpenAPI schema of entitlements."""

from __future__ import annotations

from fastapi.testclient import TestClient

from eimir.main import app


def test_openapi_schema_contains_entitlements() -> None:
    with TestClient(app) as client:
        response = client.get("/openapi.json")
    assert response.status_code == 200
    schema = response.json()

    path = schema["paths"].get("/api/v1/spaces/{spaceId}/entitlements")
    assert path is not None
    assert "get" in path
    get_op = path["get"]
    assert "tags" in get_op
    assert "entitlements" in get_op["tags"]

    components = schema["components"]["schemas"]
    assert "SpaceEntitlementView" in components
    assert "EntitlementTier" in components
    assert "EntitlementStatus" in components
