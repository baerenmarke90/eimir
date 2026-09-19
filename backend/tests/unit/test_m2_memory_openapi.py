"""The implemented Memory slice must mirror the contract approved in #70."""

from __future__ import annotations

from eimir.main import create_app


def _schema() -> dict[str, object]:
    return create_app().openapi()


def test_memory_routes_have_frozen_operation_ids() -> None:
    schema = _schema()
    paths = schema["paths"]  # type: ignore[index]
    collection = paths["/api/v1/spaces/{spaceId}/memories"]  # type: ignore[index]
    detail = paths["/api/v1/spaces/{spaceId}/memories/{memoryId}"]  # type: ignore[index]

    assert collection["post"]["operationId"] == "createMemory"
    assert collection["get"]["operationId"] == "listMemories"
    assert detail["get"]["operationId"] == "getMemory"
    assert detail["patch"]["operationId"] == "updateMemory"
    assert detail["delete"]["operationId"] == "deleteMemory"


def test_memory_mutations_require_if_match() -> None:
    schema = _schema()
    detail = schema["paths"][  # type: ignore[index]
        "/api/v1/spaces/{spaceId}/memories/{memoryId}"
    ]
    for method in ("patch", "delete"):
        parameters = detail[method]["parameters"]
        if_match = next(parameter for parameter in parameters if parameter["name"] == "If-Match")
        assert if_match["in"] == "header"
        assert if_match["required"] is True


def test_memory_write_dtos_only_expose_approved_fields() -> None:
    schema = _schema()
    components = schema["components"]["schemas"]  # type: ignore[index]

    create = components["MemoryCreate"]
    update = components["MemoryUpdate"]
    assert set(create["properties"]) == {"title", "body", "happenedOn"}
    assert set(create["required"]) == {"title"}
    assert create["properties"]["body"]["default"] == ""
    assert create["additionalProperties"] is False
    assert set(update["properties"]) == {"title", "body", "happenedOn"}
    assert update["additionalProperties"] is False


def test_memory_detail_projects_its_gallery() -> None:
    """The field was deliberately absent until the media integration slice."""
    schema = _schema()
    detail = schema["components"]["schemas"]["MemoryDetail"]  # type: ignore[index]
    assert "attachments" in detail["properties"]
    assert {"id", "spaceId", "authorId", "title", "body", "version", "capabilities"} <= set(
        detail["properties"]
    )


def test_the_gallery_never_exposes_storage_internals() -> None:
    schema = _schema()
    summary = schema["components"]["schemas"]["MemoryAttachmentSummary"]  # type: ignore[index]
    for forbidden in ("storageKey", "bucket", "provider", "filesystemPath", "privacyClass"):
        assert forbidden not in summary["properties"]
    assert "position" in summary["properties"]


def test_the_gallery_is_replaced_as_a_whole_and_needs_if_match() -> None:
    route = _schema()["paths"][  # type: ignore[index]
        "/api/v1/spaces/{spaceId}/memories/{memoryId}/attachments"
    ]["put"]
    assert route["operationId"] == "replaceMemoryAttachments"
    if_match = next(
        parameter for parameter in route["parameters"] if parameter["name"] == "If-Match"
    )
    assert if_match["required"] is True


def test_memory_create_documents_the_optional_request_identity_contract() -> None:
    """Additive #961 contract: optional header, replay 200, explicit conflict codes."""
    route = _schema()["paths"]["/api/v1/spaces/{spaceId}/memories"]["post"]  # type: ignore[index]
    header = next(
        parameter for parameter in route["parameters"] if parameter["name"] == "Idempotency-Key"
    )
    assert header["in"] == "header"
    assert header["required"] is False

    responses = route["responses"]
    assert {"200", "201", "401", "404", "409", "422"} <= set(responses)
    for status in ("200", "201"):
        assert responses[status]["headers"]["ETag"]
        assert responses[status]["content"]["application/json"]["schema"] == {
            "$ref": "#/components/schemas/MemoryDetail"
        }
    # Older clients keep working: the request body and required parameters are unchanged.
    assert route["requestBody"]["required"] is True
    assert [p["name"] for p in route["parameters"] if p.get("required")] == ["spaceId"]
