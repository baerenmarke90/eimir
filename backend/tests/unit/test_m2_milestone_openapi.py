"""The Milestone slice must mirror the contract approved in #70."""

from __future__ import annotations

import json
from pathlib import Path

from eimir.main import create_app

COLLECTION = "/api/v1/spaces/{spaceId}/milestones"
DETAIL = "/api/v1/spaces/{spaceId}/milestones/{milestoneId}"
CONTRACT = Path(__file__).parents[3] / "docs" / "m2" / "API-CONTRACT.json"


def _schema() -> dict[str, object]:
    return create_app().openapi()


def _allows_null(schema: object) -> bool:
    if not isinstance(schema, dict):
        return False
    if schema.get("type") == "null":
        return True
    any_of = schema.get("anyOf")
    return isinstance(any_of, list) and any(
        isinstance(option, dict) and option.get("type") == "null" for option in any_of
    )


def test_milestone_routes_have_frozen_operation_ids() -> None:
    paths = _schema()["paths"]  # type: ignore[index]
    assert paths[COLLECTION]["post"]["operationId"] == "createMilestone"
    assert paths[COLLECTION]["get"]["operationId"] == "listMilestones"
    assert paths[DETAIL]["get"]["operationId"] == "getMilestone"
    assert paths[DETAIL]["patch"]["operationId"] == "updateMilestone"
    assert paths[DETAIL]["delete"]["operationId"] == "deleteMilestone"


def test_mutations_require_if_match() -> None:
    detail = _schema()["paths"][DETAIL]  # type: ignore[index]
    for method in ("patch", "delete"):
        parameters = detail[method]["parameters"]
        if_match = next(parameter for parameter in parameters if parameter["name"] == "If-Match")
        assert if_match["required"] is True


def test_write_dtos_match_the_contract() -> None:
    components = _schema()["components"]["schemas"]  # type: ignore[index]
    contract = json.loads(CONTRACT.read_text(encoding="utf-8"))

    create = components["MilestoneCreate"]
    assert set(create["properties"]) == set(contract["clientWriteFields"]["MilestoneCreate"])
    # Title and date are required; body is optional.
    assert set(create["required"]) == {"title", "happenedOn"}
    assert create["additionalProperties"] is False

    update = components["MilestoneUpdate"]
    assert set(update["properties"]) == set(contract["clientWriteFields"]["MilestoneUpdate"])
    assert update["additionalProperties"] is False


def test_write_nullability_matches_the_frozen_contract() -> None:
    components = _schema()["components"]["schemas"]  # type: ignore[index]
    create_properties = components["MilestoneCreate"]["properties"]
    update_properties = components["MilestoneUpdate"]["properties"]

    assert not _allows_null(create_properties["body"])
    assert not _allows_null(update_properties["title"])
    assert _allows_null(update_properties["body"])
    assert not _allows_null(update_properties["happenedOn"])


def test_m2_resources_share_one_author_summary_schema() -> None:
    components = _schema()["components"]["schemas"]  # type: ignore[index]
    author_schema_names = {name for name in components if name.endswith("AuthorSummary")}
    assert author_schema_names == {"AuthorSummary"}

    author = components["AuthorSummary"]
    assert set(author["properties"]) == {
        "id",
        "displayName",
        "isFormerMember",
        "profileAttachmentId",
    }
    assert author["properties"]["isFormerMember"]["default"] is False

    for detail_name in ("MemoryDetail", "HeartMomentDetail", "MilestoneDetail"):
        assert components[detail_name]["properties"]["author"] == {
            "$ref": "#/components/schemas/AuthorSummary"
        }


def test_list_exposes_the_agreed_query_parameters() -> None:
    names = {
        parameter["name"]
        for parameter in _schema()["paths"][COLLECTION]["get"]["parameters"]  # type: ignore[index]
    }
    assert {"cursor", "limit", "year"} <= names
    assert "q" not in names


def test_privacy_class_is_never_a_client_field() -> None:
    components = _schema()["components"]["schemas"]  # type: ignore[index]
    for name in ("MilestoneCreate", "MilestoneUpdate", "MilestoneDetail"):
        assert "privacyClass" not in components[name]["properties"]


def test_milestone_detail_does_not_pretend_attachments_exist() -> None:
    """Media pipeline section 12 does not provide Milestone attachments in M2."""
    detail = _schema()["components"]["schemas"]["MilestoneDetail"]  # type: ignore[index]
    assert "attachments" not in detail["properties"]
    assert "attachment" not in detail["properties"]
