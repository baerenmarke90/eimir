"""Transfer privacy regression tests for account-scoped configuration."""

from uuid import uuid4

import pytest

from eimir.core.errors import ErrorCode
from eimir.transfer import service
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.models import TransferScope


@pytest.mark.parametrize(
    "table_name", ["rule_preferences", "reminder_preferences", "daily_insight_feedback"]
)
def test_shared_import_rejects_account_scoped_configuration(table_name: str) -> None:
    member_id = uuid4()
    tables = {table_name: [{"id": str(uuid4()), "accountId": str(member_id)}]}

    with pytest.raises(TransferArchiveError) as exc_info:
        service._validate_ids_and_privacy(
            TransferScope.SHARED,
            None,
            tables,
            {member_id},
        )

    assert exc_info.value.code == ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID


@pytest.mark.parametrize(
    "table_name", ["rule_preferences", "reminder_preferences", "daily_insight_feedback"]
)
def test_personal_import_rejects_partner_account_scoped_configuration(table_name: str) -> None:
    requester_id = uuid4()
    partner_id = uuid4()
    tables = {table_name: [{"id": str(uuid4()), "accountId": str(partner_id)}]}

    with pytest.raises(TransferArchiveError) as exc_info:
        service._validate_ids_and_privacy(
            TransferScope.PERSONAL,
            requester_id,
            tables,
            {requester_id, partner_id},
        )

    assert exc_info.value.code == ErrorCode.TRANSFER_PRIVACY_SCOPE_INVALID


@pytest.mark.parametrize(
    "keys, rating",
    [
        (["diagnosis"], "HELPFUL"),
        (["quiet_time"], "UNKNOWN"),
        (["quiet_time", "quiet_time"], "HELPFUL"),
        ([["unknown"]], "HELPFUL"),
        (["quiet_time"], {}),
    ],
)
def test_personal_feedback_import_rejects_unknown_or_duplicate_catalog_values(keys, rating) -> None:
    owner = uuid4()
    tables = {
        "daily_insight_feedback": [
            {
                "id": str(uuid4()),
                "accountId": str(owner),
                "recommendationKey": key,
                "rating": rating,
            }
            for key in keys
        ]
    }
    with pytest.raises(TransferArchiveError) as caught:
        service._validate_ids_and_privacy(TransferScope.PERSONAL, owner, tables, {owner})
    assert caught.value.code == ErrorCode.TRANSFER_RELATION_INVALID


def test_plan_comments_survive_selected_parent_export_and_import_validation():
    plan_id, comment_id = uuid4(), uuid4()
    rows = {
        "plans": [{"id": plan_id}],
        "comments": [{"id": comment_id, "target_type": "PLAN", "target_id": plan_id}],
    }
    service._prune_relations(rows)
    assert len(rows["comments"]) == 1
    service._validate_relations({"comments": rows["comments"]}, {"plans": {plan_id}})
    with pytest.raises(TransferArchiveError) as caught:
        service._validate_relations({"comments": rows["comments"]}, {"plans": set()})
    assert caught.value.code == ErrorCode.TRANSFER_RELATION_INVALID
    rows["plans"] = []
    service._prune_relations(rows)
    assert rows["comments"] == []


def test_plan_list_links_require_both_portable_parents():
    plan_id, collection_id = uuid4(), uuid4()
    relation = {"plan_id": plan_id, "collection_id": collection_id}
    rows = {
        "plans": [{"id": plan_id}],
        "collections": [{"id": collection_id}],
        "plan_collections": [relation],
    }
    service._prune_relations(rows)
    assert rows["plan_collections"] == [relation]
    portable = {"plan_collections": [{"planId": str(plan_id), "collectionId": str(collection_id)}]}
    service._validate_relations(portable, {"plans": {plan_id}, "collections": {collection_id}})
    with pytest.raises(TransferArchiveError):
        service._validate_relations(portable, {"plans": {plan_id}, "collections": set()})
    rows["collections"] = []
    service._prune_relations(rows)
    assert rows["plan_collections"] == []


@pytest.mark.parametrize(
    "parent_class,relation_class",
    [("OWNER_ONLY", "SPACE_SHARED"), ("OWNER_ONLY", "OWNER_ONLY"), ("SPACE_SHARED", "OWNER_ONLY")],
)
def test_plan_context_import_rejects_private_heart_associations(parent_class, relation_class):
    heart_id, plan_id = uuid4(), uuid4()
    tables = {
        "heart_moments": [{"id": str(heart_id), "privacyClass": parent_class}],
        "heart_moment_plans": [
            {
                "heartMomentId": str(heart_id),
                "planId": str(plan_id),
                "sourcePrivacyClass": relation_class,
            }
        ],
    }
    with pytest.raises(TransferArchiveError) as caught:
        service._validate_relations(tables, {"heart_moments": {heart_id}, "plans": {plan_id}})
    assert caught.value.code == ErrorCode.TRANSFER_RELATION_INVALID
