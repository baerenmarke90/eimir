"""Canonical demo coverage for the Wunschdetektiv Wish pool."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.config import Environment
from eimir.demo import create_demo_space, reset_demo_space
from eimir.demo.wish_detective import MIN_OPEN_WISHES_PER_PARTNER
from eimir.entitlements.models import Capability, EntitlementTier
from eimir.entitlements.service import get_effective_space_entitlement
from eimir.wishes.models import Wish, WishStatus
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 9, 13)
DEMO_PASSWORD = "canonical-demo-wish-detective-test-password"


def _open_titles(session: Session, *, space_id, owner_id) -> set[str]:  # type: ignore[no-untyped-def]
    return {
        wish.payload.title
        for wish in session.execute(
            select(Wish).where(
                Wish.space_id == space_id,
                Wish.owner_id == owner_id,
                Wish.status == WishStatus.OPEN.value,
            )
        ).scalars()
    }


def _assert_playable(session: Session, result) -> None:  # type: ignore[no-untyped-def]
    entitlement = get_effective_space_entitlement(session, result.space_id)
    assert entitlement.tier is EntitlementTier.PREMIUM
    assert Capability.GAMES_COUPLE.value in entitlement.capabilities
    assert (
        len(_open_titles(session, space_id=result.space_id, owner_id=result.lea_id))
        >= MIN_OPEN_WISHES_PER_PARTNER
    )
    assert (
        len(_open_titles(session, space_id=result.space_id, owner_id=result.alex_id))
        >= MIN_OPEN_WISHES_PER_PARTNER
    )


def test_canonical_demo_keeps_wish_detective_playable_across_ensure_and_reset(
    session: Session,
) -> None:
    first = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )
    _assert_playable(session, first)

    first_titles = (
        _open_titles(session, space_id=first.space_id, owner_id=first.lea_id),
        _open_titles(session, space_id=first.space_id, owner_id=first.alex_id),
    )
    ensured = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )
    assert ensured.space_id == first.space_id
    _assert_playable(session, ensured)
    assert (
        _open_titles(session, space_id=ensured.space_id, owner_id=ensured.lea_id),
        _open_titles(session, space_id=ensured.space_id, owner_id=ensured.alex_id),
    ) == first_titles

    reset = reset_demo_space(
        session,
        environment=Environment.TEST,
        reference_date=REFERENCE_DATE,
    )
    assert reset.space_id != first.space_id
    _assert_playable(session, reset)
