"""Unit coverage for the explicit Account-deletion authority bootstrap."""

from __future__ import annotations

from uuid import uuid4

import pytest

from eimir.identity import deletion_bootstrap
from eimir.identity.deletion_journal import DeletionJournal
from eimir.identity.deletion_self_service import DeletionAuthoritySettings


def test_bootstrap_creates_new_journal_and_returns_its_instance_id(
    tmp_path,
    monkeypatch,  # type: ignore[no-untyped-def]
) -> None:
    journal_path = tmp_path / "deletions.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=None)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)

    instance_id = deletion_bootstrap.bootstrap_new_deletion_authority(
        confirmed_new_installation=True,
    )

    assert journal_path.exists()
    assert DeletionJournal(journal_path, instance_id=instance_id).read_all() == ()


def test_bootstrap_refuses_established_instance_even_when_journal_is_missing(
    tmp_path,
    monkeypatch,  # type: ignore[no-untyped-def]
) -> None:
    journal_path = tmp_path / "missing.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=uuid4())
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)

    with pytest.raises(deletion_bootstrap.DeletionBootstrapError, match="already configured"):
        deletion_bootstrap.bootstrap_new_deletion_authority(confirmed_new_installation=True)

    assert not journal_path.exists()


def test_bootstrap_refuses_existing_unclaimed_journal(
    tmp_path,
    monkeypatch,  # type: ignore[no-untyped-def]
) -> None:
    journal_path = tmp_path / "deletions.journal"
    existing_instance = uuid4()
    DeletionJournal.initialize(journal_path, instance_id=existing_instance)
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=None)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)

    with pytest.raises(deletion_bootstrap.DeletionBootstrapError, match="already exists"):
        deletion_bootstrap.bootstrap_new_deletion_authority(confirmed_new_installation=True)

    assert DeletionJournal(journal_path, instance_id=existing_instance).read_all() == ()


def test_bootstrap_requires_explicit_new_installation_confirmation() -> None:
    with pytest.raises(deletion_bootstrap.DeletionBootstrapError, match="confirmation"):
        deletion_bootstrap.bootstrap_new_deletion_authority(confirmed_new_installation=False)
