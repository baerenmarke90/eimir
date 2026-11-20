"""Account deletion removes the content-free support-gesture receipts."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core.clock import now
from eimir.engagement.models import SupportGestureKind, SupportGestureRequest
from eimir.identity.deletion import apply_accepted_tombstone, apply_core_cleanup
from eimir.relationship.service import add_member
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _receipt(session: Session, *, space_id, sender_id, recipient_id) -> SupportGestureRequest:  # type: ignore[no-untyped-def]
    receipt = SupportGestureRequest(
        space_id=space_id,
        sender_account_id=sender_id,
        recipient_account_id=recipient_id,
        kind=SupportGestureKind.KISS.value,
        client_request_id=uuid4(),
        source_event_id=uuid4(),
    )
    session.add(receipt)
    session.flush()
    return receipt


@pytest.mark.parametrize("deleted_is_sender", [True, False])
def test_account_deletion_removes_support_gesture_receipts_of_either_side(
    session: Session, deleted_is_sender: bool
) -> None:
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    deleted, other = (anna, ben) if deleted_is_sender else (ben, anna)

    # One receipt in each direction: both mention the deleted Account, and the
    # per-sender cooldown/idempotency data has no purpose after deletion.
    _receipt(session, space_id=space.id, sender_id=deleted.id, recipient_id=other.id)
    _receipt(session, space_id=space.id, sender_id=other.id, recipient_id=deleted.id)

    apply_accepted_tombstone(session, deleted.id, accepted_at=now())
    apply_core_cleanup(session, deleted.id)

    remaining = session.execute(select(func.count(SupportGestureRequest.id))).scalar_one()
    assert remaining == 0
