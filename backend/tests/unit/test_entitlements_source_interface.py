"""Focused tests for normalized entitlement source-ingestion invariants."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

import pytest

from eimir.config import Environment
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)


class FixtureSession:
    def __init__(self) -> None:
        self.grants: list[EntitlementGrant] = []

    def add(self, grant: EntitlementGrant) -> None:
        self.grants.append(grant)

    def flush(self) -> None:
        pass


def test_external_source_evidence_requires_authoritative_event_time() -> None:
    current_time = datetime(2026, 9, 2, 8, 0, 0, tzinfo=UTC)

    with pytest.raises(ValueError, match="requires source_event_at"):
        entitlement_service.record_grant(
            FixtureSession(),  # type: ignore[arg-type]
            space_id=uuid4(),
            source_type=EntitlementSourceType.GOOGLE_PLAY,
            status=EntitlementStatus.ACTIVE,
            tier=EntitlementTier.PREMIUM,
            effective_from=current_time,
            effective_until=current_time + timedelta(days=30),
            external_reference="play-order-001",
        )


def test_test_fixture_source_is_available_in_demo_through_normalized_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        entitlement_service,
        "get_settings",
        lambda: SimpleNamespace(environment=Environment.DEMO),
    )
    session = FixtureSession()
    current_time = datetime(2026, 9, 2, 8, 0, 0, tzinfo=UTC)

    grant = entitlement_service.record_grant(
        session,  # type: ignore[arg-type]
        space_id=uuid4(),
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.TRIAL,
        tier=EntitlementTier.PREMIUM,
        effective_from=current_time,
        effective_until=current_time + timedelta(days=14),
        source_event_at=current_time,
    )

    assert grant.source_type == EntitlementSourceType.TEST_FIXTURE.value
    assert grant.status == EntitlementStatus.TRIAL.value
    assert session.grants == [grant]


def test_test_fixture_source_is_forbidden_in_ordinary_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        entitlement_service,
        "get_settings",
        lambda: SimpleNamespace(environment=Environment.PRODUCTION),
    )
    current_time = datetime(2026, 9, 2, 8, 0, 0, tzinfo=UTC)

    with pytest.raises(RuntimeError, match="forbidden in Production"):
        entitlement_service.record_grant(
            FixtureSession(),  # type: ignore[arg-type]
            space_id=uuid4(),
            source_type=EntitlementSourceType.TEST_FIXTURE,
            status=EntitlementStatus.ACTIVE,
            tier=EntitlementTier.PREMIUM,
            effective_from=current_time,
            effective_until=current_time + timedelta(days=30),
            source_event_at=current_time,
        )
