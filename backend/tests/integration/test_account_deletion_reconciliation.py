"""Restore-reconciliation invariants for the Account deletion lifecycle."""

from __future__ import annotations

from datetime import timedelta

import pytest

from eimir.core.clock import now
from eimir.identity.deletion import (
    DeletionAcceptanceConflictError,
    apply_accepted_tombstone,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_accepted_tombstone_rejects_conflicting_forward_timestamp(session) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Anna")
    make_space(session, account)
    accepted_at = now()
    deletion = apply_accepted_tombstone(session, account.id, accepted_at=accepted_at)
    assert deletion is not None

    with pytest.raises(DeletionAcceptanceConflictError, match="conflicts with the forward journal"):
        apply_accepted_tombstone(
            session,
            account.id,
            accepted_at=accepted_at + timedelta(seconds=1),
        )

    assert deletion.accepted_at == accepted_at
    assert account.disabled_at == accepted_at
    assert not account.is_active
