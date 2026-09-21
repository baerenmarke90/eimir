"""Canonical, opt-in demo data for development and visual QA."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from eimir.config import Environment
from eimir.core import clock
from eimir.demo.finalize import ensure_story_structure
from eimir.demo.presentation import normalize_demo_content
from eimir.demo.reminders import ensure_reminder_examples
from eimir.demo.service import DemoSeedResult
from eimir.demo.service import create_demo_space as _create_demo_space
from eimir.demo.service import reset_demo_space as _reset_demo_space
from eimir.demo.wish_detective import ensure_wish_detective_examples
from eimir.entitlements import service as entitlement_service
from eimir.entitlements.models import (
    Capability,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)

_DEMO_GAMES_ENTITLEMENT_REFERENCE = "canonical-demo-games"
_DEMO_TODAY_PRO_ENTITLEMENT_REFERENCE = "canonical-demo-today-pro"


def _ensure_games_entitlement(session: Session, result: DemoSeedResult) -> None:
    """Keep the canonical demo playable through the normalized Premium boundary."""
    instant = clock.now()
    entitlement_service.record_grant(
        session,
        space_id=result.space_id,
        account_id=result.lea_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=instant,
        effective_until=None,
        external_reference=_DEMO_GAMES_ENTITLEMENT_REFERENCE,
        source_event_at=instant,
        capabilities=[Capability.GAMES_COUPLE.value],
        metadata={"fixture": "canonical_demo_games"},
    )


def _ensure_today_pro_entitlement(session: Session, result: DemoSeedResult) -> None:
    """Keep the canonical demo Today Pro capabilities active through the normalized boundary."""
    instant = clock.now()
    entitlement_service.record_grant(
        session,
        space_id=result.space_id,
        account_id=result.lea_id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=instant,
        effective_until=None,
        external_reference=_DEMO_TODAY_PRO_ENTITLEMENT_REFERENCE,
        source_event_at=instant,
        capabilities=[
            Capability.DAILY_INSIGHTS.value,
            Capability.DAILY_QUOTE.value,
        ],
        metadata={"fixture": "canonical_demo_today_pro"},
    )


def _ensure_demo_quote_preferences(session: Session, result: DemoSeedResult) -> None:
    """Configure deterministic, distinct quote preferences for Lea and Alex."""
    from eimir.quotes import service as quote_preference_service

    quote_preference_service.update_preference(
        session,
        result.lea_id,
        enabled=True,
        selected_source_ids=["poetic_wisdom", "classic_literature"],
        selected_category_ids=["love", "mindfulness"],
        locale="de",
    )
    quote_preference_service.update_preference(
        session,
        result.alex_id,
        enabled=True,
        selected_source_ids=["stoic_philosophy"],
        selected_category_ids=["philosophy", "serenity"],
        locale="de",
    )


def _ensure_product_examples(
    session: Session,
    result: DemoSeedResult,
    *,
    reference_date: date,
) -> None:
    normalize_demo_content(session, result)
    if result.created:
        ensure_story_structure(session, result)
    ensure_reminder_examples(session, result, reference_date=reference_date)
    ensure_wish_detective_examples(
        session,
        space_id=result.space_id,
        lea_id=result.lea_id,
        alex_id=result.alex_id,
    )
    _ensure_games_entitlement(session, result)
    _ensure_today_pro_entitlement(session, result)
    _ensure_demo_quote_preferences(session, result)


def create_demo_space(
    session: Session,
    *,
    environment: Environment,
    lea_password: str,
    alex_password: str,
    reference_date: date,
) -> DemoSeedResult:
    """Create the complete canonical demo dataset, including stable product examples."""
    result = _create_demo_space(
        session,
        environment=environment,
        lea_password=lea_password,
        alex_password=alex_password,
        reference_date=reference_date,
    )
    _ensure_product_examples(session, result, reference_date=reference_date)
    return result


def reset_demo_space(
    session: Session,
    *,
    environment: Environment,
    reference_date: date,
) -> DemoSeedResult:
    """Reset the complete canonical demo dataset."""
    result = _reset_demo_space(
        session,
        environment=environment,
        reference_date=reference_date,
    )
    _ensure_product_examples(session, result, reference_date=reference_date)
    return result


__all__ = ["DemoSeedResult", "create_demo_space", "reset_demo_space"]
