"""Configuration of the operator plugin (environment prefix ``EIMIR_ADMIN_``)."""

from __future__ import annotations

from typing import Literal, Self

from pydantic import SecretStr, ValidationError, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from eimir_admin.tracker.base import IssueTracker
from eimir_admin.tracker.github import GitHubIssueTracker, is_valid_repository


class AdminSettingsError(ValueError):
    """The operator settings are invalid. Names fields only, never their values."""


class AdminTrackerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EIMIR_ADMIN_", env_file=".env", extra="ignore", env_ignore_empty=True
    )

    tracker: Literal["github"] | None = None
    github_repository: str | None = None
    github_token: SecretStr | None = None

    @field_validator("github_repository")
    @classmethod
    def _repository_form(cls, value: str | None) -> str | None:
        if value is not None and not is_valid_repository(value):
            raise ValueError("must have the form owner/name")
        return value

    @model_validator(mode="after")
    def _github_needs_repository_and_token(self) -> Self:
        if self.tracker == "github":
            if not self.github_repository:
                raise ValueError("EIMIR_ADMIN_GITHUB_REPOSITORY is required for the github tracker")
            if self.github_token is None or not self.github_token.get_secret_value():
                raise ValueError("EIMIR_ADMIN_GITHUB_TOKEN is required for the github tracker")
        return self


def load_admin_settings() -> AdminTrackerSettings:
    """Read the settings once; failures name fields and messages, never inputs."""
    try:
        return AdminTrackerSettings()
    except ValidationError as error:
        details = "; ".join(
            f"{'.'.join(str(part) for part in item['loc']) or 'settings'}: {item['msg']}"
            for item in error.errors(include_input=False, include_url=False)
        )
        raise AdminSettingsError(f"invalid operator settings: {details}") from None


def tracker_from_settings(settings: AdminTrackerSettings) -> IssueTracker | None:
    if settings.tracker is None:
        return None
    assert settings.github_repository is not None and settings.github_token is not None
    return GitHubIssueTracker(settings.github_repository, settings.github_token.get_secret_value())
