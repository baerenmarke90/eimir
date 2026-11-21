"""Daily Check-in insights on an instance without the Pro plugin (Decision 0017, #2085).

`daily.insights` is plugin-owned: the insight and weekly-review routes are plugin
code. A member's retained ratings of weekly recommendations stay Core data:
without the plugin they stay exportable and can always be cleared, while a new
rating is refused even under a current Premium grant. These tests are not Pro
feature tests: the Core-only CI job runs them with ``EIMIR_PLUGINS=""``; the
plugin-loaded job runs them against a simulated absent plugin.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager, nullcontext
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.core import clock
from eimir.daily_checkins.models import DailyInsightFeedback
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import EntitlementSourceType, EntitlementStatus, EntitlementTier
from eimir.relationship.service import add_member
from eimir.transfer import service as transfer
from eimir.transfer.models import TransferScope
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.plugins import plugins_loaded, without_plugins

pytestmark = [pytest.mark.integration, requires_database]


@contextmanager
def core_only() -> Iterator[None]:
    """Run Core-only: for real in the Core-only job, simulated in the plugin-loaded one."""
    with nullcontext() if not plugins_loaded() else without_plugins():
        yield


@pytest.fixture
def couple(session: Session) -> SimpleNamespace:
    anna, ben = make_account(session, "Anna"), make_account(session, "Ben")
    space = make_space(session, anna)
    add_member(session, space.id, ben)
    # A current Premium grant with the capability: only the plugin is missing.
    entitlements.record_grant(
        session,
        space_id=space.id,
        account_id=anna.id,
        source_type=EntitlementSourceType.TEST_FIXTURE,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=clock.now() - timedelta(days=1),
        capabilities=["daily.insights"],
    )
    # A rating given while the plugin was loaded.
    session.add(
        DailyInsightFeedback(
            space_id=space.id,
            account_id=anna.id,
            recommendation_key="quiet_time",
            rating="HELPFUL",
        )
    )
    session.flush()
    return SimpleNamespace(
        anna=anna,
        space=space,
        headers=auth(sign_in(session, anna)),
        base=f"/api/v1/spaces/{space.id}/daily-check-in",
    )


def test_without_the_plugin_retained_ratings_stay_exportable_and_clearable(
    client: TestClient, session: Session, couple: SimpleNamespace
) -> None:
    rating_path = f"{couple.base}/weekly-feedback/quiet_time"
    with core_only():
        # The ratings are personal Core data and stay in the personal export.
        context = AuthorizationContext(account_id=couple.anna.id, space_id=couple.space.id)
        rows = transfer._portable_rows(session, context, TransferScope.PERSONAL)
        assert [row["recommendation_key"] for row in rows["daily_insight_feedback"]] == [
            "quiet_time"
        ]

        # A new rating is part of the Premium review and is refused.
        refused = client.put(rating_path, headers=couple.headers, json={"rating": "NOT_FITTING"})
        assert refused.status_code == 403
        assert refused.json()["code"] == "PREMIUM_ENTITLEMENT_REQUIRED"
        stored = session.scalars(select(DailyInsightFeedback)).one()
        assert stored.rating == "HELPFUL"

        # Clearing the retained rating stays Free.
        cleared = client.put(rating_path, headers=couple.headers, json={"rating": None})
        assert cleared.status_code == 200
        assert cleared.json() == {"recommendationKey": "quiet_time", "rating": None}
        assert session.scalars(select(DailyInsightFeedback)).all() == []
