from __future__ import annotations

import json
from pathlib import Path
from typing import Any

CONTRACT_PATH = Path(__file__).parents[2] / "docs" / "m2" / "API-CONTRACT.json"


def _contract() -> dict[str, Any]:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def test_m2_contract_has_unique_space_scoped_operations() -> None:
    contract = _contract()
    operations = contract["operations"]

    operation_ids = [operation["operationId"] for operation in operations]
    method_paths = [(operation["method"], operation["path"]) for operation in operations]

    assert len(operation_ids) == len(set(operation_ids))
    assert len(method_paths) == len(set(method_paths))
    assert all(operation["path"].startswith("/spaces/{spaceId}/") for operation in operations)


def test_m2_mutations_require_if_match_when_they_change_existing_resources() -> None:
    contract = _contract()
    operations = {operation["operationId"]: operation for operation in contract["operations"]}

    required = {
        "updateMemory",
        "deleteMemory",
        "replaceMemoryAttachments",
        "updateHeartMoment",
        "changeHeartMomentVisibility",
        "deleteHeartMoment",
        "updateMilestone",
        "deleteMilestone",
        "deleteAttachment",
        "updateComment",
        "deleteComment",
    }

    assert required <= operations.keys()
    assert all(operations[operation_id]["ifMatch"] is True for operation_id in required)


def test_story_contract_is_privacy_safe_and_deterministic() -> None:
    contract = _contract()
    story = contract["story"]
    timeline = next(
        operation
        for operation in contract["operations"]
        if operation["operationId"] == "getStoryTimeline"
    )

    assert timeline["query"] == ["type", "year", "order", "cursor", "limit", "includeChapters"]
    assert "q" not in timeline["query"]
    assert story["heartMomentVisibility"] == "SHARED_ONLY"
    assert story["fullTextQuery"] is False
    assert story["sortTuple"] == ["effectiveDate", "createdAt", "kindRank", "id"]
    assert story["cursor"]["opaque"] is True
    assert story["cursor"]["integrityProtected"] is True
    assert set(story["cursor"]["binds"]) == {
        "spaceId",
        "type",
        "year",
        "order",
        "includeChapters",
    }


def test_internal_privacy_and_storage_fields_are_not_client_contract_fields() -> None:
    contract = _contract()
    client_write_fields = contract["clientWriteFields"]
    attachment_public_fields = set(contract["attachmentPublicFields"])
    forbidden = set(contract["attachmentForbiddenClientFields"])

    assert all("privacyClass" not in fields for fields in client_write_fields.values())
    assert attachment_public_fields.isdisjoint(forbidden)
    assert {"storageKey", "bucket", "provider", "filesystemPath", "credentials"} <= forbidden


def test_required_error_codes_are_frozen() -> None:
    error_codes = _contract()["errorCodes"]

    assert error_codes["RESOURCE_NOT_FOUND"] == 404
    assert error_codes["RESOURCE_VERSION_CONFLICT"] == 409
    assert error_codes["INVALID_CURSOR"] == 400
    assert error_codes["COMMENT_TARGET_NOT_AVAILABLE"] == 404
