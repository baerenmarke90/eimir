"""Production fail-closed coverage for restored deterministic entitlement fixtures."""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace

import pytest

from eimir.config import Deployment, Environment
from eimir.core.clock import now
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_restored_test_fixture_grant_is_ignored_in_production(session, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    account = make_account(session, "Fixture restore")
    space = make_space(session, account)
    current_time = now()

    # Simulate a database snapshot created in Demo/Test and later restored into
    # an ordinary Production deployment. Ingestion guards cannot prevent rows
    # that already exist in the restored database.
    session.add(
        EntitlementGrant(
            space_id=space.id,
            account_id=account.id,
            source_type=EntitlementSourceType.TEST_FIXTURE.value,
            status=EntitlementStatus.ACTIVE.value,
            tier=EntitlementTier.PREMIUM.value,
            effective_from=current_time - timedelta(days=1),
            effective_until=current_time + timedelta(days=30),
            capabilities=[Capability.RECAP_PDF_YEARBOOK.value],
        )
    )
    session.flush()

    monkeypatch.setattr(
        entitlement_service,
        "get_settings",
        lambda: SimpleNamespace(
            environment=Environment.PRODUCTION,
            deployment=Deployment.CLOUD,
        ),
    )

    effective = entitlement_service.get_effective_space_entitlement(session, space.id)

    assert effective.tier == EntitlementTier.FREE
    assert effective.status == EntitlementStatus.EXPIRED
    assert effective.effective_until is None
    assert effective.capabilities == []
