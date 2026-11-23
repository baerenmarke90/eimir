"""Operator switch for support reports and its public availability flag (#2189)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from eimir import config
from eimir.administration import service as administration
from eimir.api.v1 import instance
from eimir.auth.policy import resolve_auth_capabilities
from eimir.config import Settings


@pytest.fixture(autouse=True)
def _fresh_settings(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.delenv("EIMIR_SUPPORT_REPORTS_ENABLED", raising=False)
    config.get_settings.cache_clear()
    yield
    config.get_settings.cache_clear()


def _status_json(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    state = administration.InstanceAccessState(registration_enabled=True, maintenance_mode=False)
    # The access state is stored in the database; this test only needs the flag.
    monkeypatch.setattr(administration, "get_access_state", lambda _session: state)
    status = instance.instance_status(
        session=None,  # type: ignore[arg-type]
        auth_policy=resolve_auth_capabilities(),
    )
    return status.model_dump(by_alias=True)


def test_flag_defaults_to_false() -> None:
    assert Settings().support_reports_enabled is False


def test_flag_reads_env_var(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true")
    assert Settings().support_reports_enabled is True


@pytest.mark.parametrize("enabled", [False, True])
def test_instance_status_reports_availability(
    monkeypatch: pytest.MonkeyPatch, enabled: bool
) -> None:
    monkeypatch.setenv("EIMIR_SUPPORT_REPORTS_ENABLED", "true" if enabled else "false")
    config.get_settings.cache_clear()
    assert _status_json(monkeypatch)["supportReportsAvailable"] is enabled
