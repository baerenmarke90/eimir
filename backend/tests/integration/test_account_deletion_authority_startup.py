"""Startup/recovery coverage for the Account-deletion forward authority."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from eimir.auth import sessions
from eimir.config import Environment
from eimir.core.clock import now
from eimir.identity import deletion_self_service
from eimir.identity.deletion_journal import DeletionJournal
from eimir.identity.deletion_models import AccountDeletion
from eimir.identity.models import Account, DeviceSession
from tests.conftest import requires_database


def _committed_account_with_session(maker):  # type: ignore[no-untyped-def]
    with maker() as session:
        account = Account(display_name="Recovery Restore")
        session.add(account)
        session.flush()
        device_session, _ = sessions.start_session(session, account)
        account_id = account.id
        device_session_id = device_session.id
        session.commit()
    return account_id, device_session_id


@requires_database
class TestAccountDeletionAuthorityStartup:
    def test_pre_deletion_restore_with_missing_journal_blocks_startup(
        self,
        production_client,
        tmp_path,
        monkeypatch,  # type: ignore[no-untyped-def]
    ) -> None:
        _, maker = production_client
        account_id, device_session_id = _committed_account_with_session(maker)
        journal_path = tmp_path / "missing-after-restore.journal"
        authority = deletion_self_service.DeletionAuthoritySettings(
            journal_path=journal_path,
            instance_id=uuid4(),
        )
        monkeypatch.setattr(deletion_self_service, "_authority_settings", lambda: authority)

        with pytest.raises(RuntimeError, match="missing or could not be validated"):
            deletion_self_service.reconcile_configured_deletions_on_startup()

        assert not journal_path.exists()
        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, device_session_id)
            assert account is not None and account.disabled_at is None
            assert device_session is not None and device_session.revoked_at is None
            assert session.get(AccountDeletion, account_id) is None

    def test_pre_deletion_restore_with_newer_journal_reconverges_before_traffic(
        self,
        production_client,
        tmp_path,
        monkeypatch,  # type: ignore[no-untyped-def]
    ) -> None:
        _, maker = production_client
        account_id, device_session_id = _committed_account_with_session(maker)
        instance_id = uuid4()
        journal_path = tmp_path / "protected-newer.journal"
        journal = DeletionJournal.initialize(journal_path, instance_id=instance_id)
        tombstone = journal.accept(account_id, accepted_at=now())
        authority = deletion_self_service.DeletionAuthoritySettings(
            journal_path=journal_path,
            instance_id=instance_id,
        )
        monkeypatch.setattr(deletion_self_service, "_authority_settings", lambda: authority)

        deletion_self_service.reconcile_configured_deletions_on_startup()

        with maker() as session:
            account = session.get(Account, account_id)
            device_session = session.get(DeviceSession, device_session_id)
            deletion = session.get(AccountDeletion, account_id)
            assert account is not None and account.disabled_at is not None
            assert device_session is not None and device_session.revoked_at is not None
            assert deletion is not None and deletion.accepted_at == tombstone.accepted_at

    def test_truncated_journal_remains_fail_closed(
        self,
        production_client,
        tmp_path,
        monkeypatch,  # type: ignore[no-untyped-def]
    ) -> None:
        del production_client
        instance_id = uuid4()
        journal_path = tmp_path / "truncated.journal"
        DeletionJournal.initialize(journal_path, instance_id=instance_id)
        journal_path.write_bytes(journal_path.read_bytes()[:-1])
        authority = deletion_self_service.DeletionAuthoritySettings(
            journal_path=journal_path,
            instance_id=instance_id,
        )
        monkeypatch.setattr(deletion_self_service, "_authority_settings", lambda: authority)

        with pytest.raises(RuntimeError, match="missing or could not be validated"):
            deletion_self_service.reconcile_configured_deletions_on_startup()

    def test_foreign_instance_journal_remains_fail_closed(
        self,
        production_client,
        tmp_path,
        monkeypatch,  # type: ignore[no-untyped-def]
    ) -> None:
        del production_client
        journal_path = tmp_path / "foreign.journal"
        DeletionJournal.initialize(journal_path, instance_id=uuid4())
        authority = deletion_self_service.DeletionAuthoritySettings(
            journal_path=journal_path,
            instance_id=uuid4(),
        )
        monkeypatch.setattr(deletion_self_service, "_authority_settings", lambda: authority)

        with pytest.raises(RuntimeError, match="missing or could not be validated"):
            deletion_self_service.reconcile_configured_deletions_on_startup()


def test_production_without_bootstrapped_authority_refuses_startup(
    tmp_path,
    monkeypatch,  # type: ignore[no-untyped-def]
) -> None:
    authority = deletion_self_service.DeletionAuthoritySettings(
        journal_path=tmp_path / "not-yet-bootstrapped.journal",
        instance_id=None,
    )
    monkeypatch.setattr(deletion_self_service, "_authority_settings", lambda: authority)
    monkeypatch.setattr(
        deletion_self_service,
        "get_settings",
        lambda: SimpleNamespace(environment=Environment.PRODUCTION),
    )

    with pytest.raises(RuntimeError, match="explicitly bootstrapped"):
        deletion_self_service.reconcile_configured_deletions_on_startup()
