"""Centralized entitlement and capability evaluation service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session

from eimir.config import Deployment, Environment, get_settings
from eimir.core import clock
from eimir.entitlements.models import (
    Capability,
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)

ALL_PREMIUM_CAPABILITIES = [capability.value for capability in Capability]
CLOUD_ONLY_CAPABILITIES = frozenset({Capability.STORAGE_CLOUD_QUOTA_50GB.value})
_EXTERNAL_SOURCE_TYPES = frozenset(
    {
        EntitlementSourceType.GOOGLE_PLAY.value,
        EntitlementSourceType.CLOUD_STRIPE.value,
        EntitlementSourceType.SELF_HOSTED_KEY.value,
    }
)
_EFFECTIVE_STATUS_PRIORITY = {
    EntitlementStatus.ACTIVE: 0,
    EntitlementStatus.GRANDFATHERED: 1,
    EntitlementStatus.TRIAL: 2,
    EntitlementStatus.GRACE_PERIOD: 3,
}


@dataclass(frozen=True)
class EffectiveEntitlement:
    """Calculated commercial entitlement state for a Space."""

    space_id: UUID
    tier: EntitlementTier
    status: EntitlementStatus
    effective_until: datetime | None
    is_in_grace_period: bool
    capabilities: list[str] = field(default_factory=list)


def evaluate_grant_validity(
    grant: EntitlementGrant,
    at: datetime,
) -> tuple[bool, bool, EntitlementStatus]:
    """Evaluate whether a single grant is effective at trusted server time.

    Grace is an explicit lifecycle state. An ``ACTIVE`` grant expires at its
    configured end and never receives an implicit extension. Provider adapters
    may transition eligible recurring subscriptions to ``GRACE_PERIOD`` after a
    renewal failure; the grace grant remains effective only through its explicit
    ``effective_until`` value.

    Returns ``(is_effective, is_in_grace_period, effective_status)``.
    """
    if grant.status == EntitlementStatus.REVOKED.value:
        return False, False, EntitlementStatus.REVOKED

    if grant.status == EntitlementStatus.EXPIRED.value:
        return False, False, EntitlementStatus.EXPIRED

    if grant.effective_from > at:
        return False, False, EntitlementStatus(grant.status)

    if grant.status == EntitlementStatus.GRANDFATHERED.value:
        if grant.effective_until is None or at <= grant.effective_until:
            return True, False, EntitlementStatus.GRANDFATHERED
        return False, False, EntitlementStatus.EXPIRED

    if grant.status == EntitlementStatus.TRIAL.value:
        if grant.effective_until is None or at <= grant.effective_until:
            return True, False, EntitlementStatus.TRIAL
        return False, False, EntitlementStatus.EXPIRED

    if grant.status == EntitlementStatus.ACTIVE.value:
        if grant.effective_until is None or at <= grant.effective_until:
            return True, False, EntitlementStatus.ACTIVE
        return False, False, EntitlementStatus.EXPIRED

    if grant.status == EntitlementStatus.GRACE_PERIOD.value:
        # An unbounded grace period would silently turn a temporary renewal
        # failure into a permanent Premium grant. Fail closed instead.
        if grant.effective_until is not None and at <= grant.effective_until:
            return True, True, EntitlementStatus.GRACE_PERIOD
        return False, False, EntitlementStatus.EXPIRED

    return False, False, EntitlementStatus.EXPIRED


def _grant_capabilities(grant: EntitlementGrant, deployment: Deployment) -> set[str]:
    """Resolve one grant's capabilities for the current operating model."""
    capabilities = set(
        grant.capabilities if grant.capabilities is not None else ALL_PREMIUM_CAPABILITIES
    )
    if deployment is Deployment.SELF_HOSTED:
        capabilities.difference_update(CLOUD_ONLY_CAPABILITIES)
    return capabilities


def _ordered_capabilities(capabilities: set[str]) -> list[str]:
    """Return stable capability ordering while retaining future known strings."""
    canonical = [
        capability for capability in ALL_PREMIUM_CAPABILITIES if capability in capabilities
    ]
    extras = sorted(capabilities.difference(ALL_PREMIUM_CAPABILITIES))
    return canonical + extras


def _ensure_source_allowed(source_type: str) -> None:
    """Prevent deterministic fixtures from becoming a Production bypass."""
    if (
        source_type == EntitlementSourceType.TEST_FIXTURE.value
        and get_settings().environment is Environment.PRODUCTION
    ):
        raise RuntimeError("TEST_FIXTURE entitlements are forbidden in Production.")


def get_effective_space_entitlement(
    session: Session,
    space_id: UUID,
    at: datetime | None = None,
    *,
    deployment: Deployment | None = None,
    lock_grants: bool = False,
) -> EffectiveEntitlement:
    """Resolve the effective, reconciled entitlement state for a Space.

    All simultaneously effective grants contribute capabilities. This prevents a
    newer capability-limited promotion from masking an older still-valid grant.
    The operating model is evaluated independently so Cloud-only capabilities
    can never become applicable to Self-Hosted installations.

    Protected writes may set ``lock_grants`` to hold the participating grant
    rows through the caller's transaction, making a concurrent revocation wait
    until the already-authorized write commits. Read-only presentation queries
    leave locking disabled.
    """
    current_time = clock.ensure_utc(at) if at is not None else clock.now()
    settings = get_settings()
    effective_deployment = deployment if deployment is not None else settings.deployment

    statement = select(EntitlementGrant).where(EntitlementGrant.space_id == space_id)
    if settings.environment is Environment.PRODUCTION:
        # A restored database containing deterministic test evidence must not
        # turn that evidence into a commercial Production entitlement.
        statement = statement.where(
            EntitlementGrant.source_type != EntitlementSourceType.TEST_FIXTURE.value
        )
    statement = statement.order_by(EntitlementGrant.created_at.desc())
    if lock_grants:
        statement = statement.with_for_update()

    grants = session.execute(statement).scalars().all()

    if not grants:
        return EffectiveEntitlement(
            space_id=space_id,
            tier=EntitlementTier.FREE,
            status=EntitlementStatus.EXPIRED,
            effective_until=None,
            is_in_grace_period=False,
            capabilities=[],
        )

    effective_grants: list[tuple[EntitlementGrant, bool, EntitlementStatus]] = []
    for grant in grants:
        if grant.tier != EntitlementTier.PREMIUM.value:
            continue
        is_effective, in_grace, effective_status = evaluate_grant_validity(grant, current_time)
        if is_effective:
            effective_grants.append((grant, in_grace, effective_status))

    if effective_grants:
        capability_union: set[str] = set()
        for grant, _, _ in effective_grants:
            capability_union.update(_grant_capabilities(grant, effective_deployment))

        effective_status = min(
            (status for _, _, status in effective_grants),
            key=_EFFECTIVE_STATUS_PRIORITY.__getitem__,
        )
        in_grace_period = any(in_grace for _, in_grace, _ in effective_grants)

        # The scalar expiry represents when the overall Premium entitlement
        # ceases to be backed by any currently effective grant. An indefinite
        # grant therefore makes the overall end unbounded, while individual
        # capability changes remain represented by the capability list itself.
        effective_until_values = [grant.effective_until for grant, _, _ in effective_grants]
        effective_until = (
            None
            if any(value is None for value in effective_until_values)
            else max(value for value in effective_until_values if value is not None)
        )

        return EffectiveEntitlement(
            space_id=space_id,
            tier=EntitlementTier.PREMIUM,
            status=effective_status,
            effective_until=effective_until,
            is_in_grace_period=in_grace_period,
            capabilities=_ordered_capabilities(capability_union),
        )

    # No effective grant found. Preserve an explicit latest revocation signal;
    # all other non-effective states converge to the Free/Expired presentation.
    latest_grant = grants[0]
    latest_status = (
        EntitlementStatus.REVOKED
        if latest_grant.status == EntitlementStatus.REVOKED.value
        else EntitlementStatus.EXPIRED
    )
    return EffectiveEntitlement(
        space_id=space_id,
        tier=EntitlementTier.FREE,
        status=latest_status,
        effective_until=latest_grant.effective_until,
        is_in_grace_period=False,
        capabilities=[],
    )


def has_capability(
    session: Session,
    space_id: UUID,
    capability: str | Capability,
    at: datetime | None = None,
    *,
    deployment: Deployment | None = None,
    lock_grants: bool = False,
) -> bool:
    """Check if the given Space holds the specified capability."""
    cap_str = capability.value if isinstance(capability, Capability) else str(capability)
    entitlement = get_effective_space_entitlement(
        session,
        space_id,
        at=at,
        deployment=deployment,
        lock_grants=lock_grants,
    )
    return cap_str in entitlement.capabilities


def record_grant(
    session: Session,
    *,
    space_id: UUID,
    source_type: EntitlementSourceType | str,
    status: EntitlementStatus | str,
    tier: EntitlementTier | str = EntitlementTier.PREMIUM,
    effective_from: datetime,
    effective_until: datetime | None = None,
    account_id: UUID | None = None,
    external_reference: str | None = None,
    source_event_at: datetime | None = None,
    capabilities: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> EntitlementGrant:
    """Idempotently record or reconcile normalized source evidence.

    A provider source/reference identity may back only one grant repository-wide.
    Verified external adapters must supply their authoritative source-event time;
    older events cannot overwrite newer state, and revocation is terminal for a
    given source/reference identity. Space rebinding for Restore Purchase is a
    separate operation so replaying source evidence cannot duplicate ownership.
    """
    source_str = (
        source_type.value if isinstance(source_type, EntitlementSourceType) else str(source_type)
    )
    _ensure_source_allowed(source_str)

    status_str = status.value if isinstance(status, EntitlementStatus) else str(status)
    tier_str = tier.value if isinstance(tier, EntitlementTier) else str(tier)

    if external_reference is not None:
        external_reference = external_reference.strip()
        if not external_reference:
            raise ValueError("external_reference must not be blank.")

    if (
        external_reference is not None
        and source_str in _EXTERNAL_SOURCE_TYPES
        and source_event_at is None
    ):
        raise ValueError("External entitlement evidence requires source_event_at.")

    event_at = clock.ensure_utc(source_event_at) if source_event_at is not None else clock.now()

    if external_reference is not None:
        update_values: dict[str, Any] = {
            "status": status_str,
            "tier": tier_str,
            "effective_from": effective_from,
            "effective_until": effective_until,
            "source_event_at": event_at,
            "capabilities": capabilities,
            "updated_at": clock.now(),
        }
        if account_id is not None:
            update_values["account_id"] = account_id
        if metadata is not None:
            update_values["metadata"] = metadata

        if status_str == EntitlementStatus.REVOKED.value:
            conflict_where = EntitlementGrant.source_event_at <= event_at
        else:
            conflict_where = and_(
                EntitlementGrant.source_event_at < event_at,
                EntitlementGrant.status != EntitlementStatus.REVOKED.value,
            )

        statement = (
            postgresql.insert(EntitlementGrant)
            .values(
                space_id=space_id,
                account_id=account_id,
                source_type=source_str,
                external_reference=external_reference,
                source_event_at=event_at,
                status=status_str,
                tier=tier_str,
                effective_from=effective_from,
                effective_until=effective_until,
                capabilities=capabilities,
                metadata_=metadata or {},
            )
            .on_conflict_do_update(
                index_elements=["source_type", "external_reference"],
                set_=update_values,
                where=conflict_where,
            )
            .returning(EntitlementGrant.id)
        )
        grant_id = session.execute(statement).scalar_one_or_none()
        if grant_id is None:
            existing_grant = session.execute(
                select(EntitlementGrant).where(
                    EntitlementGrant.source_type == source_str,
                    EntitlementGrant.external_reference == external_reference,
                )
            ).scalar_one()
            return existing_grant

        reconciled_grant = session.get(EntitlementGrant, grant_id)
        if reconciled_grant is None:
            raise RuntimeError("Entitlement grant disappeared after source reconciliation.")
        session.refresh(reconciled_grant)
        return reconciled_grant

    grant = EntitlementGrant(
        space_id=space_id,
        account_id=account_id,
        source_type=source_str,
        external_reference=None,
        source_event_at=event_at,
        status=status_str,
        tier=tier_str,
        effective_from=effective_from,
        effective_until=effective_until,
        capabilities=capabilities,
        metadata_=metadata or {},
    )
    session.add(grant)
    session.flush()
    return grant


def restore_grant_to_space(
    session: Session,
    *,
    source_type: EntitlementSourceType | str,
    external_reference: str,
    space_id: UUID,
    account_id: UUID | None = None,
    at: datetime | None = None,
) -> EntitlementGrant | None:
    """Re-bind one existing effective grant without mutating source evidence."""
    source_str = (
        source_type.value if isinstance(source_type, EntitlementSourceType) else str(source_type)
    )
    _ensure_source_allowed(source_str)
    reference = external_reference.strip()
    if not reference:
        raise ValueError("external_reference must not be blank.")

    grant = session.execute(
        select(EntitlementGrant)
        .where(
            EntitlementGrant.source_type == source_str,
            EntitlementGrant.external_reference == reference,
        )
        .with_for_update()
    ).scalar_one_or_none()
    if grant is None:
        return None

    current_time = clock.ensure_utc(at) if at is not None else clock.now()
    is_effective, _, _ = evaluate_grant_validity(grant, current_time)
    if grant.tier != EntitlementTier.PREMIUM.value or not is_effective:
        raise ValueError("Only an effective Premium grant can be restored to another Space.")

    if account_id is not None and grant.account_id not in {None, account_id}:
        raise ValueError("The restoring account does not sponsor this entitlement grant.")

    grant.space_id = space_id
    if account_id is not None:
        grant.account_id = account_id
    session.flush()
    return grant


def revoke_grant(
    session: Session,
    grant_id: UUID,
    *,
    reason: str = "revoked",
) -> EntitlementGrant | None:
    """Revoke an active grant (e.g. after a refund or chargeback)."""
    grant = session.get(EntitlementGrant, grant_id)
    if grant is None:
        return None

    grant.status = EntitlementStatus.REVOKED.value
    grant.source_event_at = clock.now()
    meta = dict(grant.metadata_ or {})
    meta["revocation_reason"] = reason
    meta["revoked_at"] = clock.now().isoformat()
    grant.metadata_ = meta
    session.flush()
    return grant
