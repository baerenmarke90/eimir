"""Restore replay must converge stale Account work before workers resume."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import func, select

from eimir.authorization import AuthorizationContext
from eimir.core.clock import now
from eimir.engagement import service as engagement_service
from eimir.engagement import thinking
from eimir.engagement.models import Notification
from eimir.identity.deletion_journal import DeletionTombstone
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.deletion_reconcile import reconcile_tombstones
from eimir.identity.models import Account
from eimir.outbox.models import OutboxEvent
from eimir.relationship.service import add_member
from eimir.transfer.models import ExportStatus, TransferExport, TransferScope
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_restore_replay_prevents_stale_outbox_and_transfer_side_effects(production_client) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    accepted_at = now()
    instance_id = uuid4()

    with maker() as setup, setup.begin():
        owner = make_account(setup, "Anna")
        partner = make_account(setup, "Ben")
        space = make_space(setup, owner)
        add_member(setup, space.id, partner)
        request = thinking.send(
            setup,
            AuthorizationContext(account_id=owner.id, space_id=space.id),
            client_request_id=uuid4(),
        )
        stale_event_id = request.source_event_id
        transfer = TransferExport(
            space_id=space.id,
            created_by=owner.id,
            scope=TransferScope.PERSONAL.value,
            status=ExportStatus.QUEUED.value,
            expires_at=now() + timedelta(hours=12),
        )
        setup.add(transfer)
        setup.flush()
        owner_id = owner.id
        transfer_id = transfer.id

    tombstone = DeletionTombstone(
        instance_id=instance_id,
        account_id=owner_id,
        accepted_at=accepted_at,
        previous_digest="0" * 64,
        digest="1" * 64,
    )
    assert reconcile_tombstones([tombstone]) == 1

    with maker() as worker, worker.begin():
        processed = engagement_service.project_pending(worker, limit=50)
        assert processed >= 1

    with maker() as verify:
        account = verify.get(Account, owner_id)
        deletion = verify.get(AccountDeletion, owner_id)
        transfer = verify.get(TransferExport, transfer_id)
        stale_event = verify.get(OutboxEvent, stale_event_id)
        assert account is not None and account.disabled_at == accepted_at
        assert deletion is not None
        assert deletion.status == AccountDeletionStatus.COMPLETED.value
        assert deletion.completed_at is not None
        assert transfer is not None
        assert transfer.status == ExportStatus.EXPIRED.value
        assert stale_event is not None and stale_event.processed_at is not None
        assert (
            verify.execute(
                select(func.count(Notification.id)).where(
                    Notification.source_event_id == stale_event_id
                )
            ).scalar_one()
            == 0
        )
