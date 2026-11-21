"""Settings for the Cloud storage quota per Space (#2141)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from eimir.config import Settings


def test_the_decided_values_are_the_defaults() -> None:
    settings = Settings()

    assert settings.storage_quota_free_bytes == 5_000_000_000
    assert settings.storage_quota_premium_bytes == 50_000_000_000


def test_operator_values_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EIMIR_STORAGE_QUOTA_FREE_BYTES", "1000")
    monkeypatch.setenv("EIMIR_STORAGE_QUOTA_PREMIUM_BYTES", "2000")

    settings = Settings()

    assert settings.storage_quota_free_bytes == 1000
    assert settings.storage_quota_premium_bytes == 2000


@pytest.mark.parametrize("value", ["", "  "])
def test_an_empty_value_leaves_the_tier_unmetered(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    monkeypatch.setenv("EIMIR_STORAGE_QUOTA_FREE_BYTES", value)
    monkeypatch.setenv("EIMIR_STORAGE_QUOTA_PREMIUM_BYTES", value)

    settings = Settings()

    assert settings.storage_quota_free_bytes is None
    assert settings.storage_quota_premium_bytes is None


@pytest.mark.parametrize("value", ["0", "-1", "five"])
def test_a_quota_must_be_a_positive_byte_count(monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("EIMIR_STORAGE_QUOTA_FREE_BYTES", value)

    with pytest.raises(ValidationError):
        Settings()


def test_premium_must_not_be_below_free() -> None:
    with pytest.raises(ValidationError, match="must not be below"):
        Settings(storage_quota_free_bytes=2000, storage_quota_premium_bytes=1000)


def test_an_unmetered_tier_has_no_ordering_rule() -> None:
    settings = Settings(storage_quota_free_bytes=2000, storage_quota_premium_bytes=None)

    assert settings.storage_quota_premium_bytes is None
