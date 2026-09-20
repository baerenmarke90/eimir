"""Unit coverage for the Compose-resident Production release guard."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID, uuid4

import pytest

from eimir.deployment import release_guard
from eimir.identity import deletion_bootstrap
from eimir.identity.deletion_journal import DeletionJournal
from eimir.identity.deletion_self_service import DeletionAuthoritySettings

VERSION = "1.2.3"
BACKEND = f"ghcr.io/baerenmarke90/eimir-backend:v{VERSION}@sha256:" + "a" * 64
WEB = f"ghcr.io/baerenmarke90/eimir-web:v{VERSION}@sha256:" + "b" * 64
INSTANCE_ID = "11111111-2222-4333-8444-555555555555"


def production_environment(**overrides: str) -> dict[str, str]:
    environment = {
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_RELEASE_VERSION": VERSION,
        "EIMIR_GUARD_BACKEND_IMAGE": BACKEND,
        "EIMIR_GUARD_WEB_IMAGE": WEB,
        "EIMIR_GUARD_PULL_POLICY": "always",
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
    }
    environment.update(overrides)
    return environment


def test_verify_accepts_a_complete_digest_pinned_production_release(
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert release_guard.verify(production_environment()) == 0
    assert "passed" in capsys.readouterr().out


@pytest.mark.parametrize("environment", ["development", "demo", ""])
def test_verify_does_not_gate_other_operator_identities(environment: str) -> None:
    unsafe = production_environment(
        EIMIR_ENVIRONMENT=environment,
        EIMIR_GUARD_BACKEND_IMAGE="eimir-backend:source-development",
        EIMIR_GUARD_PULL_POLICY="never",
        EIMIR_ACCOUNT_DELETION_INSTANCE_ID="",
    )
    assert release_guard.verify(unsafe) == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"EIMIR_RELEASE_VERSION": ""},
        {"EIMIR_RELEASE_VERSION": "latest"},
        {"EIMIR_GUARD_BACKEND_IMAGE": "ghcr.io/baerenmarke90/eimir-backend:latest"},
        {"EIMIR_GUARD_BACKEND_IMAGE": f"ghcr.io/baerenmarke90/eimir-backend:v{VERSION}"},
        {"EIMIR_GUARD_BACKEND_IMAGE": "eimir-backend:source-development"},
        {"EIMIR_GUARD_BACKEND_IMAGE": WEB},
        {"EIMIR_GUARD_WEB_IMAGE": BACKEND},
        {"EIMIR_GUARD_WEB_IMAGE": f"ghcr.io/baerenmarke90/eimir-web:v9.9.9@sha256:{'b' * 64}"},
        {"EIMIR_GUARD_WEB_IMAGE": f"ghcr.io/other/eimir-web:v{VERSION}@sha256:{'b' * 64}"},
        {"EIMIR_GUARD_PULL_POLICY": "never"},
        {"EIMIR_GUARD_PULL_POLICY": "missing"},
        {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": ""},
        {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "not-a-uuid"},
    ],
)
def test_verify_refuses_any_production_release_violation(
    overrides: dict[str, str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    assert release_guard.verify(production_environment(**overrides)) == 1
    assert "refused" in capsys.readouterr().err


def test_missing_deletion_authority_points_a_new_installation_at_the_bootstrap(
    capsys: pytest.CaptureFixture[str],
) -> None:
    environment = production_environment(EIMIR_ACCOUNT_DELETION_INSTANCE_ID="")
    assert release_guard.verify(environment) == 1
    error = capsys.readouterr().err
    assert "COMPOSE_PROFILES=bootstrap" in error
    assert "ACCOUNT-DELETION-SELF-HOSTED.md" in error


def test_bootstrap_refuses_before_touching_the_journal_when_the_release_is_unsafe(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal_path = tmp_path / "deletions.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=None)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)
    environment = production_environment(
        EIMIR_GUARD_BACKEND_IMAGE="ghcr.io/baerenmarke90/eimir-backend:latest",
        EIMIR_ACCOUNT_DELETION_INSTANCE_ID="",
    )

    assert release_guard.bootstrap(environment) == 1
    assert not journal_path.exists()


def test_bootstrap_is_production_only(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    journal_path = tmp_path / "deletions.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=None)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)

    environment = production_environment(
        EIMIR_ENVIRONMENT="development", EIMIR_ACCOUNT_DELETION_INSTANCE_ID=""
    )
    assert release_guard.bootstrap(environment) == 1
    assert not journal_path.exists()


def test_bootstrap_provisions_the_authority_once_and_prints_its_instance_id(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    journal_path = tmp_path / "deletions.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=None)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)
    environment = production_environment(EIMIR_ACCOUNT_DELETION_INSTANCE_ID="")

    assert release_guard.bootstrap(environment) == 0

    printed = capsys.readouterr().out
    line = next(
        line
        for line in printed.splitlines()
        if line.startswith("EIMIR_ACCOUNT_DELETION_INSTANCE_ID=")
    )
    instance_id = line.split("=", 1)[1]
    assert DeletionJournal(journal_path, instance_id=UUID(instance_id)).read_all() == ()

    # A repeated run must refuse instead of replacing the journal.
    assert release_guard.bootstrap(environment) == 1
    assert DeletionJournal(journal_path, instance_id=UUID(instance_id)).read_all() == ()


def test_bootstrap_never_replaces_an_established_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    journal_path = tmp_path / "missing.journal"
    established = uuid4()
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=established)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)

    environment = production_environment(EIMIR_ACCOUNT_DELETION_INSTANCE_ID=str(established))
    assert release_guard.bootstrap(environment) == 1
    assert not journal_path.exists()
