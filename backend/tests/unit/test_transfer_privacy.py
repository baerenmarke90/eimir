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
