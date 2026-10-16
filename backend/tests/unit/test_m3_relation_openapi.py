"""The Relations slice must mirror the contract decided in M3-D08/D09.

Two guarantees exist exclusively in the shape of the relation contract.

For relation operations, the target type is encoded in the path, not the body
or a selector parameter. No typed relation operation accepts a `targetType`,
and no relation-target list schema contains such a discriminator. That is what
separates Option A in `docs/m3/API-DESIGN.md` from the
`(targetType,targetId)` polymorphism excluded by M3-D08.

A derived read model may still identify the type of an item it returns. In
particular, the Chapter content projection needs `targetType` to distinguish
Memory, HeartMoment, and Milestone entries without turning relation writes into
a polymorphic API.

None of the relation write operations has a request body. A relation consists
exclusively of the two IDs in the path; a body would create room for a field
that names one of the sides differently again.
"""

from __future__ import annotations

import pytest

from eimir.main import create_app

SLUGS = ("memories", "heart-moments", "milestones")

PLACE_DETAIL = "/api/v1/spaces/{spaceId}/places/{placeId}"

OPERATIONS = {
    "memories": ("listPlaceMemories", "linkPlaceMemory", "unlinkPlaceMemory"),
    "heart-moments": ("listPlaceHeartMoments", "linkPlaceHeartMoment", "unlinkPlaceHeartMoment"),
    "milestones": ("listPlaceMilestones", "linkPlaceMilestone", "unlinkPlaceMilestone"),
}


def _schema() -> dict[str, object]:
    return create_app().openapi()


def _paths() -> dict[str, dict[str, dict]]:
    return _schema()["paths"]  # type: ignore[index,return-value]


def _collection(slug: str) -> str:
    # Concatenate rather than format: the template itself contains braces for
    # spaceId and placeId, and they must remain in the resulting path.
    return f"{PLACE_DETAIL}/{slug}"


def _item(slug: str) -> str:
    return f"{_collection(slug)}/{{targetId}}"


@pytest.mark.parametrize("slug", SLUGS)
def test_relation_routes_have_frozen_operation_ids(slug: str) -> None:
    paths = _paths()
    list_operation, link_operation, unlink_operation = OPERATIONS[slug]
    assert paths[_collection(slug)]["get"]["operationId"] == list_operation
    assert paths[_item(slug)]["put"]["operationId"] == link_operation
    assert paths[_item(slug)]["delete"]["operationId"] == unlink_operation


@pytest.mark.parametrize("slug", SLUGS)
def test_relation_writes_have_no_request_body(slug: str) -> None:
    item = _paths()[_item(slug)]
    for method in ("put", "delete"):
        assert "requestBody" not in item[method], method


@pytest.mark.parametrize("slug", SLUGS)
def test_relation_writes_answer_204(slug: str) -> None:
    """`PUT` is idempotent and does not distinguish the previous state.

    There is no `201` versus `200` distinction: that difference would disclose
    what another device had done shortly before.
    """
    item = _paths()[_item(slug)]
    for method in ("put", "delete"):
        assert "204" in item[method]["responses"], method
        assert "200" not in item[method]["responses"], method
        assert "201" not in item[method]["responses"], method


def test_no_relation_operation_takes_a_target_type_discriminator() -> None:
    """Counter-check for Option B in `docs/m3/API-DESIGN.md`.

    Place and Chapter relation routes are typed by their URL. The Chapter
    `/content` endpoint is deliberately excluded because it is a derived,
    read-only projection and does not create or remove a relation.
    """
    schema = _schema()
    relation_paths = {
        path: operations
        for path, operations in schema["paths"].items()  # type: ignore[union-attr]
        if (
            "/places/{placeId}/" in path
            or (
                "/chapters/{chapterId}/" in path
                and not path.endswith("/chapters/{chapterId}/content")
            )
        )
    }
    assert relation_paths, "no relation routes in contract"

    for path, operations in relation_paths.items():
        for method, operation in operations.items():
            names = {parameter["name"] for parameter in operation.get("parameters", [])}
            assert "targetType" not in names, f"{method} {path}"
            assert "relation" not in names, f"{method} {path}"
            assert "requestBody" not in operation, f"{method} {path}"

    schemas = schema["components"]["schemas"]  # type: ignore[index]
    for schema_name in ("RelationTargets", "ChapterRelationTargets"):
        properties = schemas[schema_name]["properties"]
        assert set(properties) == {"items"}, schema_name
        assert "targetType" not in properties, schema_name

    # A read-only combined projection must identify which resource type each
    # returned ID belongs to; this is not a relation selector.
    assert set(schemas["ChapterContentItem"]["properties"]) == {"targetType", "targetId"}


def test_relation_reads_return_ids_only() -> None:
    """The list returns IDs and no content.

    A relation list that also returned titles or text would be a second read
    path with separate authorization, and two read paths can drift.
    """
    components = _schema()["components"]["schemas"]  # type: ignore[index]
    for schema_name in ("RelationTargets", "ChapterRelationTargets"):
        targets = components[schema_name]
        assert set(targets["properties"]) == {"items"}
        assert targets["properties"]["items"]["items"]["format"] == "uuid"
