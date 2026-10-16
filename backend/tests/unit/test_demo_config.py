"""Configuration invariants for the public demo deployment."""

from datetime import timedelta

import pytest
from pydantic import SecretStr, ValidationError

from eimir.config import (
    Environment,
    MailTransport,
    Settings,
    _demo_reset_interval,
)


def _public_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": Environment.DEMO,
        "demo_mode": True,
        "cursor_signing_key": SecretStr("x" * 48),
        "allowed_hosts": ["demo.example.test"],
        "public_base_url": "https://demo.example.test",
        "mail_transport": MailTransport.NONE,
    }
    values.update(overrides)
    return Settings.model_validate(values)


def test_demo_environment_keeps_public_runtime_hardening() -> None:
    settings = _public_settings()

    assert settings.environment is Environment.DEMO
    assert settings.demo_mode is True
    assert settings.is_production is True


def test_demo_environment_requires_explicit_demo_mode() -> None:
    with pytest.raises(
        ValidationError,
        match="EIMIR_ENVIRONMENT=demo requires EIMIR_DEMO_MODE=true",
    ):
        _public_settings(demo_mode=False)


def test_ordinary_production_rejects_demo_mode() -> None:
    with pytest.raises(ValidationError, match="must not be enabled"):
        _public_settings(environment=Environment.PRODUCTION, demo_mode=True)


def test_reset_timer_requires_demo_mode() -> None:
    with pytest.raises(ValidationError, match="RESET_TIMER requires EIMIR_DEMO_MODE=true"):
        Settings.model_validate(
            {
                "environment": Environment.DEVELOPMENT,
                "demo_mode": False,
                "demo_mode_reset_timer": True,
            }
        )


def test_demo_reset_interval_accepts_compact_units() -> None:
    assert _demo_reset_interval("30m") == timedelta(minutes=30)
    assert _demo_reset_interval("6h") == timedelta(hours=6)
    assert _demo_reset_interval("1d") == timedelta(days=1)


@pytest.mark.parametrize("value", ["4m", "8d", "3600", "hourly", ""])
def test_demo_reset_interval_rejects_unsafe_or_ambiguous_values(value: str) -> None:
    with pytest.raises(ValueError):
        _demo_reset_interval(value)
