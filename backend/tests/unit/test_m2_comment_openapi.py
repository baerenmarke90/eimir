"""Contract acceptance for the frozen M2 Comment routes and DTOs."""

from __future__ import annotations

from eimir.main import create_app

COMMENT_OPERATIONS = {
    ("post", "/api/v1/spaces/{spaceId}/memories/{memoryId}/comments"): "createMemoryComment",
    ("get", "/api/v1/spaces/{spaceId}/memories/{memoryId}/comments"): "listMemoryComments",
    (
        "post",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
    ): "createHeartMomentComment",
    (
        "get",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
    ): "listHeartMomentComments",
    (
        "post",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}/comments",
    ): "createMilestoneComment",
    (
        "get",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}/comments",
    ): "listMilestoneComments",
    ("patch", "/api/v1/spaces/{spaceId}/comments/{commentId}"): "updateComment",
    ("delete", "/api/v1/spaces/{spaceId}/comments/{commentId}"): "deleteComment",
}


def _schema() -> dict:  # type: ignore[type-arg]
    return create_app().openapi()


def test_all_frozen_comment_operations_are_exposed_once() -> None:
    schema = _schema()
    for (method, path), operation_id in COMMENT_OPERATIONS.items():
        assert schema["paths"][path][method]["operationId"] == operation_id


def test_comment_write_dtos_only_accept_body() -> None:
    schemas = _schema()["components"]["schemas"]
    for name in ("CommentCreate", "CommentUpdate"):
        dto = schemas[name]
        assert set(dto["properties"]) == {"body"}
        assert dto["required"] == ["body"]
        assert dto["properties"]["body"] == {"type": "string", "title": "Body"}


def test_comment_detail_reuses_shared_author_summary() -> None:
    schemas = _schema()["components"]["schemas"]
    author = schemas["CommentDetail"]["properties"]["author"]
    assert author == {"$ref": "#/components/schemas/AuthorSummary"}
    assert "targetType" not in schemas["CommentDetail"]["properties"]
    assert "targetId" not in schemas["CommentDetail"]["properties"]
