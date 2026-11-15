"""Shared video admission and optional restricted-processor test fixtures."""

from __future__ import annotations

import os
from datetime import timedelta

import pytest

from eimir.config import get_settings
from eimir.core.clock import now
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from tests.conftest import make_account, make_space, sign_in


@pytest.fixture
def owner(session, monkeypatch):  # type: ignore[no-untyped-def]
    monkeypatch.setenv("EIMIR_VIDEO_UPLOAD_ENABLED", "true")
    get_settings.cache_clear()
    account = make_account(session, "Video author")
    space = make_space(session, account)
    yield account, space, sign_in(session, account)
    get_settings.cache_clear()


def grant(session, owner):  # type: ignore[no-untyped-def]
    return entitlements.record_grant(
        session,
        space_id=owner[1].id,
        account_id=owner[0].id,
        source_type=EntitlementSourceType.SELF_HOSTED_KEY,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=now() - timedelta(days=1),
        effective_until=now() + timedelta(days=30),
    )


@pytest.fixture
def processor(monkeypatch: pytest.MonkeyPatch):  # type: ignore[no-untyped-def]
    executable = os.environ.get("EIMIR_TEST_FFMPEG")
    probe = os.environ.get("EIMIR_TEST_FFPROBE")
    if not executable or not probe:
        pytest.skip("The dedicated restricted-codec job supplies verified binaries.")
    monkeypatch.setenv("EIMIR_FFMPEG_PATH", executable)
    monkeypatch.setenv("EIMIR_FFPROBE_PATH", probe)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
