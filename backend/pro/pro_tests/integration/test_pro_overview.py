"""Pro overview figures for the operator (ServerAdmin part 5, design section 5.6)."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

import pytest
from eimir_pro.gift_codes import overview as overview_module
from eimir_pro.gift_codes import service
from eimir_pro.gift_codes.overview import ProOverview, overview
from sqlalchemy.orm import Session

from eimir.core import clock
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _space(session: Session) -> UUID:
    return make_space(session, make_account(session, "Founder")).id  # type: ignore[no-any-return]


def _grant(
    session: Session,
    space_id: UUID,
    *,
    source: EntitlementSourceType,
    status: EntitlementStatus,
    effective_from: datetime,
    effective_until: datetime | None,
    source_event_at: datetime | None = None,
    external_reference: str | None = None,
    metadata: dict[str, Any] | None = None,
    tier: EntitlementTier = EntitlementTier.PREMIUM,
) -> EntitlementGrant:
    grant = EntitlementGrant(
        space_id=space_id,
        source_type=source.value,
        external_reference=external_reference,
        source_event_at=source_event_at or effective_from,
        status=status.value,
        tier=tier.value,
        effective_from=effective_from,
        effective_until=effective_until,
        metadata_=metadata or {},
    )
    session.add(grant)
    session.flush()
    return grant


def _play(
    session: Session,
    space_id: UUID,
    *,
    status: EntitlementStatus,
    auto_renewing: bool,
    event_at: datetime,
    effective_until: datetime,
    started_at: datetime,
) -> EntitlementGrant:
    return _grant(
        session,
        space_id,
        source=EntitlementSourceType.GOOGLE_PLAY,
        status=status,
        effective_from=started_at,
        effective_until=effective_until,
        source_event_at=event_at,
        external_reference=f"play:{uuid4()}",
        metadata={"autoRenewing": auto_renewing},
    )


def _code_gift(
    session: Session, space_id: UUID, *, batch_id: UUID, at: datetime, until: datetime | None
) -> EntitlementGrant:
    return _grant(
        session,
        space_id,
        source=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=at - timedelta(days=1),
        effective_until=until,
        external_reference=f"gift-code:{uuid4()}",
        metadata={"giftCodeBatchId": str(batch_id)},
    )


def _manual_gift(
    session: Session, space_id: UUID, *, at: datetime, until: datetime | None
) -> EntitlementGrant:
    return _grant(
        session,
        space_id,
        source=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=at - timedelta(days=1),
        effective_until=until,
        metadata={"reason": "Beta tester"},
    )


def _numbers(result: ProOverview) -> dict[str, Any]:
    figures = asdict(result)
    figures.pop("running_gifts")
    figures.pop("running_gifts_total")
    return figures


def _delta(after: ProOverview, before: ProOverview) -> dict[str, Any]:
    first, second = _numbers(after), _numbers(before)
    play = {key: first["play"][key] - second["play"][key] for key in first["play"]}
    plain = {key: first[key] - second[key] for key in first if key != "play"}
    return {**plain, "play": play}


def test_the_overview_counts_spaces_play_states_and_gifts(session: Session) -> None:
    at = clock.now()
    before = overview(session, at)
    batch = service.create_batch(
        session,
        actor_id=make_account(session, "Operator").id,
        count=1,
        duration_months=3,
        redeemable_until=None,
        note="Spring promotion",
    )

    renewing, cancelled, grace, ended, gifted = (_space(session) for _ in range(5))
    _play(
        session,
        renewing,
        status=EntitlementStatus.ACTIVE,
        auto_renewing=True,
        started_at=at - timedelta(days=20),
        event_at=at - timedelta(days=20),
        effective_until=at + timedelta(days=10),
    )
    _play(
        session,
        cancelled,
        status=EntitlementStatus.ACTIVE,
        auto_renewing=False,
        started_at=at - timedelta(days=40),
        event_at=at - timedelta(days=10),
        effective_until=at + timedelta(days=20),
    )
    _play(
        session,
        grace,
        status=EntitlementStatus.GRACE_PERIOD,
        auto_renewing=True,
        started_at=at - timedelta(days=33),
        event_at=at - timedelta(days=2),
        effective_until=at + timedelta(days=3),
    )
    _play(
        session,
        ended,
        status=EntitlementStatus.EXPIRED,
        auto_renewing=False,
        started_at=at - timedelta(days=35),
        event_at=at - timedelta(days=5),
        effective_until=at - timedelta(days=5),
    )
    _manual_gift(session, gifted, at=at, until=at + timedelta(days=30))
    _code_gift(session, gifted, batch_id=batch.id, at=at, until=at + timedelta(days=90))

    after = overview(session, at)

    assert _delta(after, before) == {
        "spaces_total": 5,
        "spaces_premium": 4,
        "premium_by_play": 3,
        "premium_by_gift": 1,
        "cancellations_30d": 1,
        "play": {"active": 1, "cancelled_running": 1, "payment_problem": 1, "ended_30d": 1},
    }
    assert after.running_gifts_total - before.running_gifts_total == 1
    rows = [row for row in after.running_gifts if row.space_id == gifted]
    assert len(rows) == 1
    assert rows[0].origin == "code"
    assert rows[0].batch_note == "Spring promotion"
    assert rows[0].effective_until == at + timedelta(days=90)


def test_a_space_with_play_and_a_gift_counts_once_under_play(session: Session) -> None:
    at = clock.now()
    before = overview(session, at)
    both = _space(session)
    _play(
        session,
        both,
        status=EntitlementStatus.ACTIVE,
        auto_renewing=True,
        started_at=at - timedelta(days=1),
        event_at=at - timedelta(days=1),
        effective_until=at + timedelta(days=29),
    )
    _manual_gift(session, both, at=at, until=at + timedelta(days=60))

    delta = _delta(overview(session, at), before)

    assert (delta["spaces_premium"], delta["premium_by_play"], delta["premium_by_gift"]) == (
        1,
        1,
        0,
    )


def test_only_effective_premium_grants_count(session: Session) -> None:
    at = clock.now()
    before = overview(session, at)
    lapsed, future, free_tier, revoked = (_space(session) for _ in range(4))
    _manual_gift(session, lapsed, at=at - timedelta(days=60), until=at - timedelta(days=1))
    _grant(
        session,
        future,
        source=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=at + timedelta(days=1),
        effective_until=at + timedelta(days=30),
    )
    _grant(
        session,
        free_tier,
        source=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        effective_from=at - timedelta(days=1),
        effective_until=None,
        tier=EntitlementTier.FREE,
    )
    _grant(
        session,
        revoked,
        source=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.REVOKED,
        effective_from=at - timedelta(days=1),
        effective_until=None,
    )

    after = overview(session, at)

    assert _delta(after, before)["spaces_premium"] == 0
    assert after.running_gifts_total == before.running_gifts_total


def test_the_latest_play_grant_decides_the_state_and_revocations_count(
    session: Session,
) -> None:
    at = clock.now()
    before = overview(session, at)
    resubscribed, revoked, old_cancel = (_space(session) for _ in range(3))
    _play(
        session,
        resubscribed,
        status=EntitlementStatus.EXPIRED,
        auto_renewing=False,
        started_at=at - timedelta(days=90),
        event_at=at - timedelta(days=60),
        effective_until=at - timedelta(days=60),
    )
    _play(
        session,
        resubscribed,
        status=EntitlementStatus.ACTIVE,
        auto_renewing=True,
        started_at=at - timedelta(days=3),
        event_at=at - timedelta(days=3),
        effective_until=at + timedelta(days=27),
    )
    _play(
        session,
        revoked,
        status=EntitlementStatus.REVOKED,
        auto_renewing=False,
        started_at=at - timedelta(days=20),
        event_at=at - timedelta(days=4),
        effective_until=at + timedelta(days=10),
    )
    _play(
        session,
        old_cancel,
        status=EntitlementStatus.ACTIVE,
        auto_renewing=False,
        started_at=at - timedelta(days=60),
        event_at=at - timedelta(days=31),
        effective_until=at + timedelta(days=5),
    )

    delta = _delta(overview(session, at), before)

    assert delta["play"] == {
        "active": 1,
        "cancelled_running": 1,
        "payment_problem": 0,
        "ended_30d": 1,
    }
    assert delta["cancellations_30d"] == 1
    assert delta["premium_by_play"] == 2


def test_running_gifts_are_one_row_per_space_by_end_with_unlimited_last(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    at = clock.now()
    soon, unlimited, later = (_space(session) for _ in range(3))
    _manual_gift(session, soon, at=at, until=at + timedelta(days=5))
    _manual_gift(session, unlimited, at=at, until=None)
    _manual_gift(session, unlimited, at=at, until=at + timedelta(days=400))
    _manual_gift(session, later, at=at, until=at + timedelta(days=50))
    mine = {soon, unlimited, later}

    rows = [row for row in overview(session, at).running_gifts if row.space_id in mine]

    assert [(row.space_id, row.origin, row.batch_note) for row in rows] == [
        (soon, "manual", None),
        (later, "manual", None),
        (unlimited, "manual", None),
    ]
    assert rows[-1].effective_until is None

    monkeypatch.setattr(overview_module, "RUNNING_GIFTS_LIMIT", 1)
    capped = overview(session, at)
    assert len(capped.running_gifts) == 1
    assert capped.running_gifts_total >= 3
