"""Established shared answers remain one thread when insert timestamps race."""

from datetime import UTC, date, datetime, timedelta
from unittest.mock import Mock
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.memories import experiences
from eimir.memories.models import Memory, MemoryPayload


@pytest.mark.parametrize("pending_first", [True, False])
def test_pending_answer_joins_the_committed_thread_even_if_its_insert_predates_the_root(
    monkeypatch, pending_first: bool
) -> None:  # type: ignore[no-untyped-def]
    space_id, first, second = uuid4(), uuid4(), uuid4()
    at = datetime(2026, 11, 4, 8, tzinfo=UTC)

    def answer(owner_id, created_at):  # type: ignore[no-untyped-def]
        return Memory(
            id=uuid4(),
            space_id=space_id,
            owner_id=owner_id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            experience_kind="HAPPINESS",
            happened_on=date(2020, 6, 12),
            created_at=created_at,
            updated_at=created_at,
            payload=MemoryPayload(title="What made today beautiful?", body=str(owner_id)),
        )

    root = answer(first, at)
    root.experience_root_id = root.id
    pending = answer(second, at - timedelta(seconds=1))
    candidates = [pending, root] if pending_first else [root, pending]
    session = Mock(spec=Session)
    session.scalar.return_value = pending.id
    session.scalars.side_effect = [[pending], candidates]
    monkeypatch.setattr(experiences, "lock_subject", Mock())

    experiences.reconcile(session, AuthorizationContext(account_id=second, space_id=space_id))

    assert pending.experience_root_id == root.id
    assert root.experience_root_id == root.id
    assert pending.payload.body == str(second)
    assert pending.updated_at == at - timedelta(seconds=1)
    assert root.updated_at == at
