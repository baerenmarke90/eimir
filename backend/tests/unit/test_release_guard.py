"""Unit coverage for the Compose-resident Production release guard."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
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


def published_identity() -> dict[str, Any]:
    """The authoritative record; never derived from the environment under test."""

    return {
        "schemaVersion": 1,
        "kind": "eimir-self-hosted-image-identity",
        "product": {"version": VERSION, "tag": f"v{VERSION}"},
        "sourceRevision": "c" * 40,
        "images": {
            "backend": {
                "reference": BACKEND,
                "digest": BACKEND.split("@", 1)[1],
                "roles": ["api", "worker", "migrate"],
            },
            "web": {"reference": WEB, "digest": WEB.split("@", 1)[1], "roles": ["web"]},
        },
    }


@pytest.fixture
def identity_path(tmp_path: Path) -> Path:
    path = tmp_path / "self-hosted-image-identity.json"
    path.write_text(json.dumps(published_identity()), encoding="utf-8")
    return path


def production_environment(**overrides: str) -> dict[str, str]:
    environment = {
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_RELEASE_VERSION": VERSION,
        "EIMIR_GUARD_BACKEND_IMAGE": BACKEND,
        "EIMIR_GUARD_WEB_IMAGE": WEB,
        "EIMIR_GUARD_PULL_POLICY": "always",
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID": INSTANCE_ID,
        "EIMIR_COMPOSE_PROFILES": "self-hosted",
        "EIMIR_ENCRYPTION_AT_REST": "required",
    }
    environment.update(overrides)
    return environment


def test_verify_accepts_the_published_production_release(
    identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert release_guard.verify(production_environment(), identity_path=identity_path) == 0
    assert "passed" in capsys.readouterr().out


@pytest.mark.parametrize("environment", ["development", "test", "demo"])
def test_verify_does_not_gate_explicit_non_production_identities(
    environment: str, tmp_path: Path
) -> None:
    unsafe = production_environment(
        EIMIR_ENVIRONMENT=environment,
        EIMIR_GUARD_BACKEND_IMAGE="eimir-backend:source-development",
        EIMIR_GUARD_PULL_POLICY="never",
        EIMIR_ACCOUNT_DELETION_INSTANCE_ID="",
    )
    missing_identity = tmp_path / "absent.json"
    assert release_guard.verify(unsafe, identity_path=missing_identity) == 0


@pytest.mark.parametrize("environment", ["", "   ", "Production", "prod", "staging", "productionx"])
def test_verify_fails_closed_for_an_unset_or_unknown_environment(
    environment: str, identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    result = release_guard.verify(
        production_environment(EIMIR_ENVIRONMENT=environment), identity_path=identity_path
    )
    assert result == 1
    assert "EIMIR_ENVIRONMENT" in capsys.readouterr().err


def test_verify_fails_closed_when_the_environment_variable_is_absent(
    identity_path: Path,
) -> None:
    environment = production_environment()
    del environment["EIMIR_ENVIRONMENT"]
    assert release_guard.verify(environment, identity_path=identity_path) == 1


DIFFERENT_BACKEND = f"ghcr.io/baerenmarke90/eimir-backend:v{VERSION}@sha256:" + "d" * 64
DIFFERENT_WEB = f"ghcr.io/baerenmarke90/eimir-web:v{VERSION}@sha256:" + "e" * 64


@pytest.mark.parametrize(
    "overrides",
    [
        {"EIMIR_RELEASE_VERSION": ""},
        {"EIMIR_RELEASE_VERSION": "latest"},
        {"EIMIR_RELEASE_VERSION": "9.9.9"},
        {"EIMIR_GUARD_BACKEND_IMAGE": "ghcr.io/baerenmarke90/eimir-backend:latest"},
        {"EIMIR_GUARD_BACKEND_IMAGE": f"ghcr.io/baerenmarke90/eimir-backend:v{VERSION}"},
        {"EIMIR_GUARD_BACKEND_IMAGE": ""},
        {"EIMIR_GUARD_BACKEND_IMAGE": "eimir-backend:source-development"},
        {"EIMIR_GUARD_BACKEND_IMAGE": WEB},
        {"EIMIR_GUARD_WEB_IMAGE": BACKEND},
        # Well-formed, digest-pinned, right version, but not the published digest.
        {"EIMIR_GUARD_BACKEND_IMAGE": DIFFERENT_BACKEND},
        {"EIMIR_GUARD_WEB_IMAGE": DIFFERENT_WEB},
        {"EIMIR_GUARD_PULL_POLICY": "never"},
        {"EIMIR_GUARD_PULL_POLICY": "missing"},
        {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": ""},
        {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "not-a-uuid"},
        {"EIMIR_COMPOSE_PROFILES": "self-hosted,bootstrap"},
        {"EIMIR_COMPOSE_PROFILES": "bootstrap"},
    ],
)
def test_verify_refuses_any_production_release_violation(
    overrides: dict[str, str], identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    result = release_guard.verify(production_environment(**overrides), identity_path=identity_path)
    assert result == 1
    assert "refused" in capsys.readouterr().err


def test_a_different_digest_is_refused_even_when_it_is_a_valid_release_reference(
    identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    environment = production_environment(EIMIR_GUARD_BACKEND_IMAGE=DIFFERENT_BACKEND)
    assert release_guard.release_problems(
        environment, identity_path=identity_path, require_deletion_authority=True
    ) == [
        "EIMIR_SELF_HOSTED_BACKEND_IMAGE differs from the backend image published in "
        "self-hosted-image-identity.json for EIMIR_RELEASE_VERSION"
    ]


def tampered(mutate: Any) -> dict[str, Any]:
    identity = published_identity()
    mutate(identity)
    return identity


@pytest.mark.parametrize(
    "identity",
    [
        {},
        [],
        {"schemaVersion": 1, "kind": "eimir-self-hosted-image-identity", "unreleased": "x"},
        tampered(lambda i: i.update(schemaVersion=2)),
        tampered(lambda i: i.update(kind="other")),
        tampered(lambda i: i["product"].update(tag="v9.9.9")),
        tampered(lambda i: i["product"].update(version="9.9.9", tag="v9.9.9")),
        tampered(lambda i: i.update(sourceRevision="short")),
        tampered(lambda i: i["images"]["backend"].update(digest="sha256:" + "f" * 64)),
        tampered(lambda i: i["images"]["backend"].update(roles=["api"])),
        tampered(lambda i: i["images"]["web"].update(roles=["web", "api"])),
        tampered(lambda i: i["images"].pop("web")),
        tampered(lambda i: i.update(images=[])),
        tampered(lambda i: i["images"]["web"].update(reference=BACKEND)),
    ],
)
def test_an_inconsistent_or_placeholder_identity_is_refused(identity: Any, tmp_path: Path) -> None:
    path = tmp_path / "identity.json"
    path.write_text(json.dumps(identity), encoding="utf-8")
    assert release_guard.verify(production_environment(), identity_path=path) == 1


def test_a_missing_unreadable_or_malformed_identity_is_refused(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert release_guard.verify(production_environment(), identity_path=tmp_path / "gone") == 1
    assert "not mounted" in capsys.readouterr().err
    (tmp_path / "directory").mkdir()
    assert release_guard.verify(production_environment(), identity_path=tmp_path / "directory") == 1
    malformed = tmp_path / "malformed.json"
    malformed.write_text("{", encoding="utf-8")
    assert release_guard.verify(production_environment(), identity_path=malformed) == 1


def test_missing_deletion_authority_points_a_new_installation_at_the_bootstrap(
    identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    environment = production_environment(EIMIR_ACCOUNT_DELETION_INSTANCE_ID="")
    assert release_guard.verify(environment, identity_path=identity_path) == 1
    error = capsys.readouterr().err
    assert "COMPOSE_PROFILES=bootstrap" in error
    assert "ACCOUNT-DELETION-SELF-HOSTED.md" in error


@pytest.fixture
def journal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    return _journal(tmp_path, monkeypatch, instance_id=None)


def _journal(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *, instance_id: UUID | None) -> Path:
    journal_path = tmp_path / "deletions.journal"
    authority = DeletionAuthoritySettings(journal_path=journal_path, instance_id=instance_id)
    monkeypatch.setattr(deletion_bootstrap, "DeletionAuthoritySettings", lambda: authority)
    return journal_path


def bootstrap_environment(**overrides: str) -> dict[str, str]:
    values = {"EIMIR_ACCOUNT_DELETION_INSTANCE_ID": "", "EIMIR_COMPOSE_PROFILES": "bootstrap"}
    values.update(overrides)
    return production_environment(**values)


def test_bootstrap_refuses_before_touching_the_journal_when_the_release_is_unsafe(
    journal: Path, identity_path: Path
) -> None:
    environment = bootstrap_environment(EIMIR_GUARD_BACKEND_IMAGE=DIFFERENT_BACKEND)
    assert release_guard.bootstrap(environment, identity_path=identity_path) == 1
    assert not journal.exists()


@pytest.mark.parametrize("environment", ["development", "demo", "", "unknown"])
def test_bootstrap_is_explicit_production_only(
    environment: str, journal: Path, identity_path: Path
) -> None:
    result = release_guard.bootstrap(
        bootstrap_environment(EIMIR_ENVIRONMENT=environment), identity_path=identity_path
    )
    assert result == 1
    assert not journal.exists()


@pytest.mark.parametrize("profiles", ["self-hosted", "bootstrap,self-hosted", "bootstrap,demo"])
def test_bootstrap_refuses_to_run_next_to_the_runtime_profile(
    profiles: str, journal: Path, identity_path: Path
) -> None:
    environment = bootstrap_environment(EIMIR_COMPOSE_PROFILES=profiles)
    assert release_guard.bootstrap(environment, identity_path=identity_path) == 1
    assert not journal.exists()


def test_bootstrap_provisions_the_authority_once_and_prints_its_instance_id(
    journal: Path, identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    assert release_guard.bootstrap(bootstrap_environment(), identity_path=identity_path) == 0

    printed = capsys.readouterr().out
    line = next(
        line
        for line in printed.splitlines()
        if line.startswith("EIMIR_ACCOUNT_DELETION_INSTANCE_ID=")
    )
    instance_id = UUID(line.split("=", 1)[1])
    assert DeletionJournal(journal, instance_id=instance_id).read_all() == ()

    # A lost instance ID with the journal still present is a recovery case, not a
    # bootstrap opportunity: the second run refuses and leaves the journal alone.
    assert release_guard.bootstrap(bootstrap_environment(), identity_path=identity_path) == 1
    assert DeletionJournal(journal, instance_id=instance_id).read_all() == ()
    assert "already exists" in capsys.readouterr().err


def test_bootstrap_never_replaces_an_established_authority(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, identity_path: Path
) -> None:
    established = uuid4()
    journal_path = _journal(tmp_path, monkeypatch, instance_id=established)
    environment = bootstrap_environment(EIMIR_ACCOUNT_DELETION_INSTANCE_ID=str(established))

    assert release_guard.bootstrap(environment, identity_path=identity_path) == 1
    assert not journal_path.exists()


# --- application-controlled encryption at rest (issue #797) -----------------


@pytest.mark.parametrize("value", ["", "on", "true", "REQUIRED", "Required"])
def test_production_refuses_an_unset_or_unknown_encryption_mode(
    value: str, identity_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    environment = production_environment(EIMIR_ENCRYPTION_AT_REST=value)
    assert release_guard.verify(environment, identity_path=identity_path) == 1
    assert "EIMIR_ENCRYPTION_AT_REST" in capsys.readouterr().err


@pytest.mark.parametrize("value", ["required", "migrating", "disabled"])
def test_every_explicit_mode_passes_the_guard(value: str, identity_path: Path) -> None:
    environment = production_environment(EIMIR_ENCRYPTION_AT_REST=value)
    assert release_guard.verify(environment, identity_path=identity_path) == 0


def test_the_guard_environment_never_carries_key_material() -> None:
    """Keys reach the API and worker only; the guard is a secret-free one-shot."""
    assert not any("KEYS" in name or "ACTIVE_KEY" in name for name in production_environment())
