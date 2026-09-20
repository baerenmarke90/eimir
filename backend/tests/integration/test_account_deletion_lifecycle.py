"""Terminal orchestration for the server-authoritative Account deletion lifecycle."""

from __future__ import annotations

from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.administration.models import AdministrationAction, InstanceAdministrationActionEvent
from eimir.core.clock import now
from eimir.identity import deletion_lifecycle
from eimir.identity.deletion import mark_deletion_failed
from eimir.identity.deletion_lifecycle import (
    DeletionMediaCleanupError,
    converge_accepted_deletion,
)
from eimir.identity.deletion_media import (
    MEDIA_CLEANUP_FAILURE_CODE,
    AccountMediaCleanupResult,
)
from eimir.identity.deletion_models import AccountDeletion, AccountDeletionStatus
from eimir.identity.models import Account
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _setup_account(maker) -> UUID:  # type: ignore[no-untyped-def]
    with maker() as setup, setup.begin():
        account = make_account(setup, "Anna")
        make_space(setup, account)
        return account.id


def _setup_admin_deletion(maker) -> tuple[UUID, UUID]:  # type: ignore[no-untyped-def]
    with maker() as setup, setup.begin():
        actor = make_account(setup, "Operator")
        account = make_account(setup, "Anna")
        make_space(setup, account)
        setup.add(
            InstanceAdministrationActionEvent(
                actor_id=actor.id,
                target_account_id=account.id,
                action=AdministrationAction.ACCOUNT_DELETION_REQUESTED.value,
            )
        )
        setup.flush()
        return account.id, actor.id


def _deletion_audit_events(session: Session, account_id: UUID) -> list[InstanceAdministrationActionEvent]:
    return list(
        session.execute(
            select(InstanceAdministrationActionEvent)
            .where(InstanceAdministrationActionEvent.target_account_id == account_id)
            .order_by(
                InstanceAdministrationActionEvent.created_at,
                InstanceAdministrationActionEvent.id,
            )
        ).scalars()
    )


def test_full_deletion_convergence_marks_completed_once(production_client) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    account_id, actor_id = _setup_admin_deletion(maker)
    accepted_at = now()

    converge_accepted_deletion(account_id, accepted_at=accepted_at)

    with maker() as verify:
        account = verify.get(Account, account_id)
        deletion = verify.get(AccountDeletion, account_id)
        assert account is not None and account.disabled_at == accepted_at
        assert deletion is not None
        assert deletion.status == AccountDeletionStatus.COMPLETED.value
        assert deletion.completed_at is not None
        assert deletion.failed_at is None
        assert deletion.last_failure_code is None
        events = _deletion_audit_events(verify, account_id)
        assert [event.action for event in events] == [
            AdministrationAction.ACCOUNT_DELETION_REQUESTED.value,
            AdministrationAction.ACCOUNT_DELETION_FAILED.value,
            AdministrationAction.ACCOUNT_DELETION_COMPLETED.value,
        ]
        assert all(event.actor_id == actor_id for event in events)
        first_completed_at = deletion.completed_at
        events = _deletion_audit_events(verify, account_id)
        assert [event.action for event in events] == [
            AdministrationAction.ACCOUNT_DELETION_REQUESTED.value,
            AdministrationAction.ACCOUNT_DELETION_COMPLETED.value,
        ]
        assert all(event.actor_id == actor_id for event in events)

    converge_accepted_deletion(account_id, accepted_at=accepted_at)

    with maker() as verify:
        deletion = verify.get(AccountDeletion, account_id)
        assert deletion is not None
        assert deletion.status == AccountDeletionStatus.COMPLETED.value
        assert deletion.completed_at == first_completed_at
        events = _deletion_audit_events(verify, account_id)
        assert [event.action for event in events].count(
            AdministrationAction.ACCOUNT_DELETION_COMPLETED.value
        ) == 1


def test_failed_phase_cannot_complete_and_retry_converges(
    production_client,
    monkeypatch: pytest.MonkeyPatch,
) -> None:  # type: ignore[no-untyped-def]
    _, maker = production_client
    account_id, actor_id = _setup_admin_deletion(maker)
    accepted_at = now()
    attempts = 0

    def fail_media_once(session: Session, target_id) -> AccountMediaCleanupResult:  # type: ignore[no-untyped-def]
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            mark_deletion_failed(
                session,
                target_id,
                failure_code=MEDIA_CLEANUP_FAILURE_CODE,
            )
            return AccountMediaCleanupResult(purge_failures=1)
        return AccountMediaCleanupResult()

    monkeypatch.setattr(
        deletion_lifecycle,
        "apply_account_media_cleanup",
        fail_media_once,
    )

    with pytest.raises(DeletionMediaCleanupError):
        converge_accepted_deletion(account_id, accepted_at=accepted_at)

    with maker() as verify:
        account = verify.get(Account, account_id)
        deletion = verify.get(AccountDeletion, account_id)
        assert account is not None and account.disabled_at == accepted_at
        assert deletion is not None
        assert deletion.status == AccountDeletionStatus.FAILED.value
        assert deletion.completed_at is None
        assert deletion.last_failure_code == MEDIA_CLEANUP_FAILURE_CODE
        events = _deletion_audit_events(verify, account_id)
        assert [event.action for event in events] == [
            AdministrationAction.ACCOUNT_DELETION_REQUESTED.value,
            AdministrationAction.ACCOUNT_DELETION_FAILED.value,
        ]
        assert all(event.actor_id == actor_id for event in events)

    converge_accepted_deletion(account_id, accepted_at=accepted_at)

    with maker() as verify:
        deletion = verify.get(AccountDeletion, account_id)
        assert deletion is not None
        assert deletion.status == AccountDeletionStatus.COMPLETED.value
        assert deletion.completed_at is not None
        assert deletion.failed_at is None
        assert deletion.last_failure_code is None
