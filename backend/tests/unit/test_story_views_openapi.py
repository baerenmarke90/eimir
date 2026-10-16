"""OpenAPI boundaries for intentional Story-view receipts."""

from __future__ import annotations

from eimir.main import create_app

PATH = "/api/v1/spaces/{spaceId}/story-views"


def _schema() -> dict[str, object]:
    return create_app().openapi()


def test_story_view_contract_is_write_only() -> None:
    path = _schema()["paths"][PATH]  # type: ignore[index]

    assert set(path) == {"post"}
    assert path["post"]["operationId"] == "recordStoryView"  # type: ignore[index]
    assert "204" in path["post"]["responses"]  # type: ignore[index]


def test_story_view_request_contains_only_kind_and_item_id() -> None:
    schemas = _schema()["components"]["schemas"]  # type: ignore[index]
    request = schemas["StoryViewReceipt"]

    assert set(request["properties"]) == {"kind", "itemId"}
    assert set(request["required"]) == {"kind", "itemId"}


def test_existing_timeline_contract_is_unchanged() -> None:
    operation = _schema()["paths"]["/api/v1/spaces/{spaceId}/timeline"]["get"]  # type: ignore[index]

    assert operation["operationId"] == "getStoryTimeline"  # type: ignore[index]
