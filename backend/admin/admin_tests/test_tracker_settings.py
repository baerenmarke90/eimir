"""Operator tracker settings and plugin validation."""

from __future__ import annotations

from pathlib import Path
from typing import Any, cast

import pytest
from eimir_admin.plugin import plugin
from eimir_admin.tracker.github import GitHubIssueTracker
from eimir_admin.tracker.settings import (
    AdminSettingsError,
    AdminTrackerSettings,
    tracker_from_settings,
)

TOKEN = "ghp_supersecrettoken123"
NAMES = ("TRACKER", "GITHUB_REPOSITORY", "GITHUB_TOKEN")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    for name in NAMES:
        monkeypatch.delenv(f"EIMIR_ADMIN_{name}", raising=False)
    # No stray .env file of the working directory may leak into the tests.
    monkeypatch.chdir(tmp_path)


def configure(monkeypatch: pytest.MonkeyPatch, **values: str) -> None:
    for name, value in values.items():
        monkeypatch.setenv(f"EIMIR_ADMIN_{name}", value)


def validate() -> None:
    plugin.validate(cast(Any, object()))


def test_empty_environment_values_count_as_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, TRACKER="", GITHUB_REPOSITORY="", GITHUB_TOKEN="")
    validate()
    assert tracker_from_settings(AdminTrackerSettings()) is None


@pytest.mark.parametrize("repository", [".", "..", "./.", "a/.", "./b", "-/-", "a/b/c"])
def test_degenerate_repository_rejected(monkeypatch: pytest.MonkeyPatch, repository: str) -> None:
    configure(monkeypatch, TRACKER="github", GITHUB_REPOSITORY=repository, GITHUB_TOKEN=TOKEN)
    with pytest.raises(AdminSettingsError):
        validate()


def test_validate_accepts_unset_tracker() -> None:
    validate()
    assert tracker_from_settings(AdminTrackerSettings()) is None


def test_validate_accepts_complete_github_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, TRACKER="github", GITHUB_REPOSITORY="eimir/eimir", GITHUB_TOKEN=TOKEN)
    validate()
    assert isinstance(tracker_from_settings(AdminTrackerSettings()), GitHubIssueTracker)


@pytest.mark.parametrize(
    "values",
    [
        {"TRACKER": "github"},
        {"TRACKER": "github", "GITHUB_REPOSITORY": "eimir/eimir"},
        {"TRACKER": "github", "GITHUB_TOKEN": TOKEN},
    ],
)
def test_validate_rejects_tracker_without_repository_or_token(
    monkeypatch: pytest.MonkeyPatch, values: dict[str, str]
) -> None:
    configure(monkeypatch, **values)
    with pytest.raises(AdminSettingsError) as info:
        validate()
    assert TOKEN not in str(info.value)


def test_malformed_repository_rejected_without_leaking_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure(monkeypatch, TRACKER="github", GITHUB_REPOSITORY="nope", GITHUB_TOKEN=TOKEN)
    with pytest.raises(AdminSettingsError) as info:
        validate()
    assert TOKEN not in str(info.value)
    assert "github_repository" in str(info.value)


def test_token_not_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    configure(monkeypatch, TRACKER="github", GITHUB_REPOSITORY="eimir/eimir", GITHUB_TOKEN=TOKEN)
    assert TOKEN not in repr(AdminTrackerSettings())
