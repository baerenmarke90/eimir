"""Operator configuration boundaries of calendar sync (#1895)."""

import pytest
from pydantic import ValidationError

from eimir.config import Deployment, Settings


def test_private_caldav_hosts_are_self_hosted_only_and_normalized(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    loaded = Settings(
        _env_file=None,
        calendar_caldav_private_hosts=[" Dav.Home.Example. ", "", "dav.home.example"],
    )
    assert loaded.calendar_caldav_private_hosts == ["dav.home.example"]
    with pytest.raises(ValidationError, match="Self-Hosted option"):
        Settings(
            _env_file=None,
            deployment=Deployment.CLOUD,
            calendar_caldav_private_hosts=["dav.home.example"],
        )


def test_an_empty_google_calendar_secret_counts_as_unset(encryption) -> None:  # type: ignore[no-untyped-def]
    encryption.apply("required")
    assert (
        Settings(_env_file=None, google_calendar_client_secret="").google_calendar_client_secret
        is None
    )
