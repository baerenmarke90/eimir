"""Unit tests for the centralized entitlement and capability service."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

from eimir.config import Deployment
from eimir.entitlements.models import (
    Capability,
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.entitlements.service import (
    ALL_PREMIUM_CAPABILITIES,
    evaluate_grant_validity,
    get_effective_space_entitlement,
    has_capability,
    record_grant,
    revoke_grant,
)


class FakeSession:
    def __init__(self, grants: list[EntitlementGrant] | None = None) -> None:
        self._grants: list[EntitlementGrant] = grants or []

    def execute(self, statement) -> object:  # type: ignore[no-untyped-def]
        class Result:
            def __init__(self, items: list[EntitlementGrant]) -> None:
                self._items = items

            def scalars(self) -> Result:
                return self

            def all(self) -> list[EntitlementGrant]:
                return self._items

            def first(self) -> EntitlementGrant | None:
                return self._items[0] if self._items else None

        return Result(self._grants)

    def add(self, entity: EntitlementGrant) -> None:
        self._grants.append(entity)

    def get(self, entity_class: type, entity_id: object) -> EntitlementGrant | None:
        for grant in self._grants:
            if grant.id == entity_id:
                return grant
        return None

    def flush(self) -> None:
        pass


def test_free_space_defaults_to_expired_with_no_capabilities() -> None:
    space_id = uuid4()
    session = FakeSession([])
    effective = get_effective_space_entitlement(session, space_id)

    assert effective.space_id == space_id
    assert effective.tier == EntitlementTier.FREE
    assert effective.status == EntitlementStatus.EXPIRED
    assert effective.effective_until is None
    assert effective.is_in_grace_period is False
    assert effective.capabilities == []
    assert not has_capability(session, space_id, Capability.CHAPTER_RICH_PRESENTATION)


def test_active_premium_grant_provides_all_cloud_premium_capabilities() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.GOOGLE_PLAY.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=1),
        effective_until=now + timedelta(days=30),
        capabilities=None,
    )
    session = FakeSession([grant])
    effective = get_effective_space_entitlement(
        session,
        space_id,
        at=now,
        deployment=Deployment.CLOUD,
    )

    assert effective.tier == EntitlementTier.PREMIUM
    assert effective.status == EntitlementStatus.ACTIVE
    assert effective.is_in_grace_period is False
    assert set(effective.capabilities) == set(ALL_PREMIUM_CAPABILITIES)
    assert has_capability(
        session,
        space_id,
        Capability.RECAP_PDF_YEARBOOK,
        at=now,
        deployment=Deployment.CLOUD,
    )


def test_active_grant_does_not_receive_implicit_grace_after_period_end() -> None:
    space_id = uuid4()
    effective_until = datetime(2026, 9, 1, 0, 0, 0, tzinfo=UTC)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.CLOUD_STRIPE.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=effective_until - timedelta(days=30),
        effective_until=effective_until,
        capabilities=None,
    )
    session = FakeSession([grant])

    after_expiry = effective_until + timedelta(days=1)
    effective = get_effective_space_entitlement(
        session,
        space_id,
        at=after_expiry,
        deployment=Deployment.CLOUD,
    )

    assert effective.tier == EntitlementTier.FREE
    assert effective.status == EntitlementStatus.EXPIRED
    assert effective.is_in_grace_period is False
    assert effective.capabilities == []


def test_explicit_14_day_grace_period_keeps_capabilities_active() -> None:
    space_id = uuid4()
    grace_start = datetime(2026, 9, 1, 0, 0, 0, tzinfo=UTC)
    grace_end = grace_start + timedelta(days=14)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.CLOUD_STRIPE.value,
        status=EntitlementStatus.GRACE_PERIOD.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=grace_start,
        effective_until=grace_end,
        capabilities=None,
    )
    session = FakeSession([grant])

    day_5 = grace_start + timedelta(days=5)
    effective_5 = get_effective_space_entitlement(
        session,
        space_id,
        at=day_5,
        deployment=Deployment.CLOUD,
    )
    assert effective_5.tier == EntitlementTier.PREMIUM
    assert effective_5.status == EntitlementStatus.GRACE_PERIOD
    assert effective_5.is_in_grace_period is True
    assert has_capability(
        session,
        space_id,
        Capability.STORAGE_CLOUD_QUOTA_50GB,
        at=day_5,
        deployment=Deployment.CLOUD,
    )

    effective_14 = get_effective_space_entitlement(
        session,
        space_id,
        at=grace_end,
        deployment=Deployment.CLOUD,
    )
    assert effective_14.is_in_grace_period is True
    assert has_capability(
        session,
        space_id,
        Capability.STORAGE_CLOUD_QUOTA_50GB,
        at=grace_end,
        deployment=Deployment.CLOUD,
    )

    day_15 = grace_end + timedelta(days=1)
    effective_15 = get_effective_space_entitlement(
        session,
        space_id,
        at=day_15,
        deployment=Deployment.CLOUD,
    )
    assert effective_15.tier == EntitlementTier.FREE
    assert effective_15.status == EntitlementStatus.EXPIRED
    assert effective_15.is_in_grace_period is False
    assert not has_capability(
        session,
        space_id,
        Capability.STORAGE_CLOUD_QUOTA_50GB,
        at=day_15,
        deployment=Deployment.CLOUD,
    )


def test_unbounded_grace_period_fails_closed() -> None:
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=uuid4(),
        source_type=EntitlementSourceType.CLOUD_STRIPE.value,
        status=EntitlementStatus.GRACE_PERIOD.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=1),
        effective_until=None,
    )

    is_effective, in_grace, status = evaluate_grant_validity(grant, now)
    assert is_effective is False
    assert in_grace is False
    assert status == EntitlementStatus.EXPIRED


def test_self_hosted_premium_excludes_cloud_quota_capability() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.SELF_HOSTED_KEY.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=1),
        effective_until=now + timedelta(days=365),
        capabilities=None,
    )
    session = FakeSession([grant])

    effective = get_effective_space_entitlement(
        session,
        space_id,
        at=now,
        deployment=Deployment.SELF_HOSTED,
    )

    assert effective.tier == EntitlementTier.PREMIUM
    assert Capability.STORAGE_CLOUD_QUOTA_50GB.value not in effective.capabilities
    assert Capability.RECAP_PDF_YEARBOOK.value in effective.capabilities
    assert not has_capability(
        session,
        space_id,
        Capability.STORAGE_CLOUD_QUOTA_50GB,
        at=now,
        deployment=Deployment.SELF_HOSTED,
    )


def test_grandfathered_and_trial_grants() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    grant_trial = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.ADMIN_GRANT.value,
        status=EntitlementStatus.TRIAL.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=5),
        effective_until=now + timedelta(days=9),
    )
    session_trial = FakeSession([grant_trial])
    effective_trial = get_effective_space_entitlement(session_trial, space_id, at=now)
    assert effective_trial.tier == EntitlementTier.PREMIUM
    assert effective_trial.status == EntitlementStatus.TRIAL

    grant_gf = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.ADMIN_GRANT.value,
        status=EntitlementStatus.GRANDFATHERED.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=100),
        effective_until=None,
    )
    session_gf = FakeSession([grant_gf])
    effective_gf = get_effective_space_entitlement(session_gf, space_id, at=now)
    assert effective_gf.tier == EntitlementTier.PREMIUM
    assert effective_gf.status == EntitlementStatus.GRANDFATHERED


def test_revoked_grant_is_not_effective() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.GOOGLE_PLAY.value,
        status=EntitlementStatus.REVOKED.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=10),
        effective_until=now + timedelta(days=20),
    )
    session = FakeSession([grant])
    effective = get_effective_space_entitlement(session, space_id, at=now)
    assert effective.tier == EntitlementTier.FREE
    assert effective.status == EntitlementStatus.REVOKED
    assert effective.capabilities == []


def test_multiple_effective_grants_union_capabilities() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    subscription = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.CLOUD_STRIPE.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=30),
        effective_until=now + timedelta(days=30),
        capabilities=[Capability.RECAP_PDF_YEARBOOK.value],
    )
    promotion = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.ADMIN_GRANT.value,
        status=EntitlementStatus.GRANDFATHERED.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=1),
        effective_until=now + timedelta(days=10),
        capabilities=[Capability.THEME_BESPOKE_PACKS.value],
    )
    session = FakeSession([promotion, subscription])

    effective = get_effective_space_entitlement(
        session,
        space_id,
        at=now,
        deployment=Deployment.CLOUD,
    )

    assert effective.tier == EntitlementTier.PREMIUM
    assert effective.status == EntitlementStatus.ACTIVE
    assert set(effective.capabilities) == {
        Capability.RECAP_PDF_YEARBOOK.value,
        Capability.THEME_BESPOKE_PACKS.value,
    }
    assert effective.effective_until == subscription.effective_until


def test_multiple_grants_ignore_expired_and_keep_active() -> None:
    space_id = uuid4()
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    expired_grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.GOOGLE_PLAY.value,
        status=EntitlementStatus.EXPIRED.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=60),
        effective_until=now - timedelta(days=30),
    )
    active_grant = EntitlementGrant(
        id=uuid4(),
        space_id=space_id,
        source_type=EntitlementSourceType.SELF_HOSTED_KEY.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now - timedelta(days=2),
        effective_until=now + timedelta(days=365),
    )
    session = FakeSession([expired_grant, active_grant])
    effective = get_effective_space_entitlement(session, space_id, at=now)
    assert effective.tier == EntitlementTier.PREMIUM
    assert effective.status == EntitlementStatus.ACTIVE


def test_grant_validity_future_grant() -> None:
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)
    future_grant = EntitlementGrant(
        id=uuid4(),
        space_id=uuid4(),
        source_type=EntitlementSourceType.ADMIN_GRANT.value,
        status=EntitlementStatus.ACTIVE.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=now + timedelta(days=5),
        effective_until=now + timedelta(days=35),
    )
    is_eff, in_grace, status = evaluate_grant_validity(future_grant, now)
    assert not is_eff
    assert not in_grace
    assert status == EntitlementStatus.ACTIVE


def test_record_and_revoke_unreferenced_grant() -> None:
    space_id = uuid4()
    account_id = uuid4()
    session = FakeSession([])
    now = datetime(2026, 9, 1, 12, 0, 0, tzinfo=UTC)

    grant = record_grant(
        session,
        space_id=space_id,
        account_id=account_id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.GRANDFATHERED,
        tier=EntitlementTier.PREMIUM,
        effective_from=now,
        effective_until=None,
        external_reference=None,
    )

    assert grant.space_id == space_id
    assert grant.account_id == account_id
    assert grant.external_reference is None
    assert grant.status == EntitlementStatus.GRANDFATHERED.value

    revoked = revoke_grant(session, grant.id, reason="operator-revoked")
    assert revoked is not None
    assert revoked.status == EntitlementStatus.REVOKED.value
    assert revoked.metadata_["revocation_reason"] == "operator-revoked"
